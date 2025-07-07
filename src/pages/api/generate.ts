import type { APIRoute } from 'astro'
import { generatePayload, parseOpenAIStream } from '@/utils/openAI'
import { verifySignature } from '@/utils/auth'
const defaultSiliconflowAPIKey = import.meta.env.DEFAULT_API_KEY || ''; // 修改：变量名更明确
import prompts from "@/prompts"

// 新增：定义不同提供商的配置
const PROVIDER_CONFIG = {
  'siliconflow': {
    baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    model: 'deepseek-ai/DeepSeek-V3',
  },
  '302ai': {
    baseUrl: 'https://api.302.ai/v1/chat/completions',
    model: 'deepseek-chat',
  }
};

// cloudflare pages 不支持node方法，简单的粗算
function countTokens(str: string) {
  var len = 0;
  for (var i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127 || str.charCodeAt(i) == 94) {
      len += 1.5;
    } else {
      len += 0.25;
    }
  }
  return Math.floor(len)
}

export const post: APIRoute = async (context) => {
  const body = await context.request.json()
  const { sign, time, messages, setting } = body
  if (!messages) {
    return new Response('No input text')
  }

  // --- 新增和修改的核心逻辑 ---
  const provider = setting.modelProvider || 'siliconflow'; // 默认使用硅基流动
  const config = PROVIDER_CONFIG[provider];
  
  let apiKey: string;
  if (provider === '302ai') {
    apiKey = setting.threeohtwoAPIKey;
  } else {
    // 默认或明确选择硅基流动时，使用其Key或Vercel上的默认Key
    apiKey = setting.siliconflowAPIKey || defaultSiliconflowAPIKey;
  }
  
  if (!apiKey) {
    const providerName = provider === '302ai' ? '302.AI' : '硅基流动';
    return new Response(`🙏 请在“拈花”设置中配置 ${providerName} 的 API Key，或联系管理员。`);
  }
  // --- 核心逻辑结束 ---

  const prompt = prompts.find((item) => item.role == setting.role)?.prompt || setting.customRule;
  let reqMessages = [];

  const maxToken = 5000 - countTokens(prompt) - countTokens(messages[messages.length - 1].content)

  let j = 0;
  let len = 0;
  // 遍历历史消息，如果消息
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const lastContent = messages[i + 1] ? messages[i + 1].content : ''
    if (msg.content == lastContent) {
      continue;
    }
    len += countTokens(msg.content);
    if (i > messages.length - 15) {
      reqMessages.unshift(msg)
      continue;
    }
    j++;
    if (j > 10 || len > maxToken) {
      break;
    }
    reqMessages.unshift(msg)
  }

  const fm = messages[0]
  if (fm.role == "user" && reqMessages[0].content != fm.content && fm.content.length > 20) {
    reqMessages.unshift(fm)
  }
  if (prompt) {
    reqMessages.unshift({
      role: "system",
      content: prompt,
    })
  }

  // 修改：传入动态的模型名称
  const initOptions = generatePayload(apiKey, 0.8, reqMessages, config.model);
  
  // @ts-ignore
  let response = new Response();

  try {
    // 修改：使用动态的 baseUrl
    response = await fetch(config.baseUrl, initOptions) as Response;
    if (response.status > 400) {
      // 专门处理余额不足或限额超出的错误
      if (response.status === 402 || response.statusText.includes('insufficient')) {
        return new Response("🙏 API Key 余额不足或被限制，请检查Key或看下方【告示】")
      } else if (response.status === 429) {
        return new Response("🙏 当前系统负载过高或 API Key 限额已达上限，请稍后再试或看下方【告示】")
      }
      throw new Error(`${response.status}:${response.statusText}`);
    }
  } catch (error) {
    return new Response(`⚠️AI服务商响应错误 ${error}`)
  }

  return new Response(parseOpenAIStream(response))
}

export const get: APIRoute = async (context) => {
  const roles = prompts.filter((item) => {
    return !!item.enabled
  }).map((item) => {
    return {
      ...item,
      "prompt": ''
    }
  })
  return new Response(JSON.stringify(roles), {
    headers: {
      'Content-Type': 'application/json',
    }
  })
}
