import type { ChatMessage } from '@/types';
import { createSignal, Index, Show, createEffect, onMount, For } from 'solid-js';
import IconClear from './icons/Clear';
import IconMarkdown from './icons/Markdown';
import MessageItem from './MessageItem';
import Setting from "./Setting";
import _ from 'lodash';
import Swiper, { Navigation } from 'swiper';
import 'swiper/css';
import { register } from 'swiper/element/bundle';

register();
Swiper.use([Navigation]);

export interface Role {
  role: string;
  avatar: string;
  fc: string;
}

// 聊天缓存管理类
class ChatCacheManager {
  private static readonly CACHE_PREFIX = 'ai_chat_cache_';
  
  // 保存角色的聊天记录
  static saveRoleChat(roleId: string, messages: ChatMessage[]): void {
    try {
      const cacheKey = this.CACHE_PREFIX + roleId;
      localStorage.setItem(cacheKey, JSON.stringify(messages));
    } catch (error) {
      console.warn('保存聊天记录失败:', error);
    }
  }
  
  // 加载角色的聊天记录
  static loadRoleChat(roleId: string): ChatMessage[] {
    try {
      const cacheKey = this.CACHE_PREFIX + roleId;
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    } catch (error) {
      console.warn('加载聊天记录失败:', error);
      return [];
    }
  }
  
  // 清空指定角色的聊天记录
  static clearRoleChat(roleId: string): void {
    try {
      const cacheKey = this.CACHE_PREFIX + roleId;
      localStorage.removeItem(cacheKey);
    } catch (error) {
      console.warn('清空聊天记录失败:', error);
    }
  }
  
  // 清空所有角色的聊天记录
  static clearAllChats(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('清空所有聊天记录失败:', error);
    }
  }
}

export default () => {
  let inputRef: HTMLTextAreaElement;
  let messagesContainerRef: HTMLDivElement;
  const [messageList, setMessageList] = createSignal<ChatMessage[]>([]);
  const [currentAssistantMessage, setCurrentAssistantMessage] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [controller, setController] = createSignal<AbortController>(null);
  const [currentRole, setCurrentRole] = createSignal<Role>({ role: '', avatar: '', fc: '' });
  const [roles, setRoles] = createSignal<Role[]>([]);
  const [autoScroll, setAutoScroll] = createSignal(false);

  const defaultSetting = {
    openaiAPIKey: "",
    customRule: "",
    openaiAPITemperature: 70,
  };

  const [setting, setSetting] = createSignal({
    ...defaultSetting
  });

  // 获取历史配置
  onMount(async () => {
    const storage = localStorage.getItem("setting");
    try {
      if (storage) {
        const parsed = JSON.parse(storage);
        setSetting({
          ...defaultSetting,
          ...parsed
        });
      }
    } catch {
      console.log("Setting parse error");
    }
    const response = await fetch('/api/generate');
    let roles = await response.json();
    setRoles([...roles]);
  });

  // 保存历史配置
  createEffect(() => {
    localStorage.setItem("setting", JSON.stringify(setting()));
  });

  // 保存当前角色的聊天记录到缓存
  createEffect(() => {
    if (currentRole().role) {
      ChatCacheManager.saveRoleChat(currentRole().role, messageList());
    }
  });

  createEffect(() => {
    const swiper = new Swiper('.swiper', {
      slidesPerView: "auto",
      autoplay: false,
      direction: 'horizontal',
      grabCursor: true,
      observer: true,
      observeParents: true,
      parallax: true,
      navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev',
      },
    });
  });

  const handleButtonClick = async () => {
    const inputValue = inputRef.value;
    if (!inputValue) {
      return;
    }
    inputRef.value = '';
    setMessageList([
      ...messageList(),
      {
        role: 'user',
        content: inputValue,
      },
    ]);
    requestWithLatestMessage();
  };

  const requestWithLatestMessage = async () => {
    setLoading(true);
    setCurrentAssistantMessage('');
    try {
      const controller = new AbortController();
      setController(controller);
      let requestMessageList = [...messageList()];
      if (requestMessageList[0].role == 'assistant') {
        requestMessageList = requestMessageList.slice(1);
      }
      requestMessageList = requestMessageList.filter((item) => {
        return !item.content.includes('⚠️');
      });
      if (requestMessageList.length > 15) {
        requestMessageList = [...requestMessageList.slice(0, 3), ...requestMessageList.slice(-12)];
      }
      const timestamp = Date.now();
      const response = await fetch('/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          setting: {
            ...setting(),
            role: currentRole().role,
          },
          messages: requestMessageList,
          time: timestamp,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      const data = response.body;
      if (!data) {
        throw new Error('No data');
      }
      const reader = data.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (value) {
          let char = decoder.decode(value);
          if (char === '\n' && currentAssistantMessage().endsWith('\n')) {
            continue;
          }
          if (char) {
            setCurrentAssistantMessage(currentAssistantMessage() + char);
          }
        }
        done = readerDone;
      }
    } catch (e) {
      setLoading(false);
      setController(null);
      return;
    }
    archiveCurrentMessage();
  };

  const archiveCurrentMessage = () => {
    if (currentAssistantMessage()) {
      setMessageList([
        ...messageList(),
        {
          role: 'assistant',
          content: currentAssistantMessage(),
        },
      ]);
      setCurrentAssistantMessage('');
      setLoading(false);
      setController(null);
      inputRef.focus();
    }
  };

  // 修改clear函数，只清空当前角色的聊天记录
  const clear = () => {
    inputRef.value = '';
    inputRef.style.height = 'auto';
    setMessageList([]);
    setCurrentAssistantMessage('');
    // 从缓存中也清除当前角色的聊天记录
    if (currentRole().role) {
      ChatCacheManager.clearRoleChat(currentRole().role);
    }
  };

  const stopStreamFetch = () => {
    if (controller()) {
      controller().abort();
      archiveCurrentMessage();
    }
  };

  // 修改choiceRole函数，实现聊天记录的保存和加载
  const choiceRole = (newRole: Role) => {
    // 如果是同一个角色，不需要切换
    if (currentRole().role === newRole.role) {
      return;
    }

    // 保存当前角色的聊天记录（如果有的话）
    if (currentRole().role) {
      ChatCacheManager.saveRoleChat(currentRole().role, messageList());
    }

    // 设置新角色
    setCurrentRole(newRole);

    // 加载新角色的聊天记录
    const cachedMessages = ChatCacheManager.loadRoleChat(newRole.role);
    
    if (cachedMessages.length > 0) {
      // 如果有缓存的聊天记录，直接加载
      setMessageList(cachedMessages);
    } else {
      // 如果没有缓存记录，显示角色的初始消息
      setMessageList([]);
      setCurrentAssistantMessage(newRole.fc);
      // 立即归档初始消息
      setTimeout(() => {
        archiveCurrentMessage();
      }, 100);
    }

    // 清空当前正在输入的消息
    setCurrentAssistantMessage('');
  };

  const retryLastFetch = () => {
    if (messageList().length > 0) {
      const lastMessage = messageList()[messageList().length - 1];
      if (lastMessage.role === 'assistant') {
        setMessageList(messageList().slice(0, -1));
        requestWithLatestMessage();
      }
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.isComposing || e.shiftKey) {
      return;
    }
    if (e.key === 'Enter') {
      handleButtonClick();
    }
  };

  // 导出为Markdown的功能
  const exportToMarkdown = () => {
    const markdownLines = messageList().map(message => {
      if (message.role === 'assistant') {
        return `**${currentRole().role}:** ${message.content}`;
      }
      if (message.role === 'user') {
        return `**善知识:** ${message.content}`;
      }
      return `**${message.role}:** ${message.content}`;
    });
 
    const markdown = markdownLines.join('\n\n');
    const blob = new Blob([markdown], { type: 'text/markdown' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${currentRole().role}-对话记录.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div my-6>
      <div>
        <div class="swiper">
          <div class="swiper-wrapper">
            <For each={roles()} fallback={<div>请深呼吸等待...</div>}>
              {(item) => (
                <div
                  classList={{ selected: currentRole().role === item.role }}
                  onClick={() => choiceRole(item)}
                  class="swiper-slide"
                  data-role={item.role}>
                  <div class="avatar-wrapper">
                    <img src={item.avatar} alt={item.role} class="avatar" />
                  </div>
                  <div class="info-wrapper">
                    <h3 class="title">
                      <span class="scope">{item.role}</span>
                    </h3>
                  </div>
                </div>
              )}
            </For>
          </div>
          <div class="swiper-button-prev"></div>
          <div class="swiper-button-next"></div>
        </div>
      </div>

      <div ref={messagesContainerRef}>
        <Index each={messageList()}>
          {(message, index) => (
            <MessageItem
              role={message().role}
              message={message().content}
              assistantAvatar={currentRole().avatar}
              showRetry={() => (message().role === 'assistant' && index === messageList().length - 1)}
              onRetry={retryLastFetch}
            />
          )}
        </Index>

        {currentAssistantMessage() && (
          <MessageItem
            role="assistant"
            assistantAvatar={currentRole().avatar}
            message={currentAssistantMessage}
          />
        )}
      </div>

      <Show
        when={!loading()}
        fallback={() => (
          <div class="h-12 my-4 flex gap-4 items-center justify-center bg-slate bg-op-15 rounded-sm">
            <span>请保持平和与欢喜...</span>
            <div class="px-2 py-0.5 border border-slate rounded-md text-sm op-70 cursor-pointer hover:bg-slate/10" onClick={stopStreamFetch}>唵</div>
          </div>
        )}
      >
        <div class="my-4 flex items-center gap-2 transition-opacity">
          <button title="清除当前角色对话" onClick={clear} class="h-12 px-2 py-2 bg-slate bg-op-15 rounded-lg hover:bg-slate-50 transition-all duration-200">
            <IconClear />
          </button>
          <textarea
            ref={inputRef!}
            onKeyDown={handleKeydown}
            placeholder="点击头像开启对话"
            autocomplete="off"
            onInput={() => {
              inputRef.style.height = 'auto';
              inputRef.style.height = inputRef.scrollHeight + 'px';
            }}
            rows="1"
            class="w-full px-3 py-3 min-h-12 max-h-36 rounded-sm bg-slate bg-op-15 resize-none focus:bg-op-20 focus:ring-0 focus:outline-none placeholder:op-50 dark:placeholder:op-30"
          />
          <button onClick={handleButtonClick} class="h-12 px-2 py-2 bg-slate bg-op-15 rounded-lg hover:bg-slate-50 transition-all duration-200">
            <svg t="1741404073185" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1758" width="16" height="16"><path d="M0 438.857143h1024v146.285714H0z" p-id="1759" fill="#b8976d"></path><path d="M438.857143 0h146.285714v1024H438.857143z" p-id="1760" fill="#b8976d"></path><path d="M0 0h585.142857v146.285714H0zM438.857143 877.714286h585.142857v146.285714H438.857143zM877.714286 0h146.285714v585.142857h-146.285714zM0 438.857143h146.285714v585.142857H0z" p-id="1761" fill="#b8976d"></path></svg>
          </button>
    
          <button title="导出Markdown" onClick={exportToMarkdown} class="h-12 px-1 py-2 bg-op-15 hover:bg-op-20 transition-all duration-200">
            <svg t="1741400278058" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1501" width="22" height="22"><path d="M522.748775 502.326102c27.230231-31.529741 59.476557-65.925822 91.006298-99.605318 2.149755-4.29951 4.29951-12.89853 2.149756-17.198041-19.347796-50.877537-48.727782-97.455563-95.305809-131.851644-45.144857 34.396081-74.524843 80.974108-96.022393 131.851644-2.149755 4.29951 0 10.748775 2.149755 15.048286 32.246326 33.679496 65.925822 70.225332 96.022393 101.755073zM549.979006 561.802659c27.946816 65.925822 37.979006 134.0014 33.679496 210.675997 31.529741 2.149755 61.626312 4.29951 91.006299 0 6.449265 2.149755 17.198041-4.29951 21.49755-10.748775 27.946816-40.128761 55.177047-78.824353 74.524843-123.252624 31.529741-78.824353 37.979006-159.081875 10.748775-242.205738-10.748775-31.529741-12.89853-33.679496-44.428271-21.497551-83.123863 32.246326-142.60042 91.722883-184.878937 166.247725-2.149755 5.73268-4.29951 14.3317-2.149755 20.780966zM303.473758 372.624213c-29.379986-10.03219-31.529741-7.882435-42.278517 21.49755-35.829251 108.204339-15.048286 209.959412 37.979007 308.131561 8.59902 16.481456 19.347796 25.080476 40.845346 20.780966 15.048286-2.149755 31.529741 0 46.578027 2.149755 48.727782 8.59902 97.455563 19.347796 150.482855 29.379986 6.449265-55.177047-2.149755-110.354094-23.647306-163.381386-40.128761-101.755073-105.337999-177.713086-209.959412-218.558432zM807.23303 850.586424c-19.347796 4.29951-37.979006 12.89853-57.326802 21.497551-65.925822 25.080476-131.851645 44.428272-202.076977 33.679496-42.278516-6.449265-80.974108-31.529741-91.006298-61.626312 8.59902 4.29951 15.048286 6.449265 23.647306 8.59902 31.529741 6.449265 63.059482 15.048286 97.455563 17.198041 37.979006 2.149755 65.925822-19.347796 76.674598-53.027292-6.449265-2.149755-10.748775-2.149755-12.898531-2.149755-50.877537-10.748775-103.904829-21.497551-154.782365-31.529741-25.797061-6.449265-50.877537-12.89853-76.674597-17.198041-99.605318-15.048286-182.729181 23.647306-222.857943 101.755074-8.59902 12.89853-8.59902 21.497551 6.449265 29.379986 21.497551 12.89853 42.278516 27.946816 63.776067 37.979006 203.510147 108.204339 422.785164 87.423373 601.214836-57.326802 4.29951-2.149755 6.449265-6.449265 10.748775-10.748775-17.914626-20.780966-41.561931-22.930721-62.342897-16.481456zM267.644507 735.93282C225.36599 674.306508 203.868439 606.230931 195.269419 528.123163c-31.529741 4.29951-63.776067 6.449265-97.455563 10.748775-4.29951 0-10.748775 10.748775-10.748776 17.198041 8.59902 88.856543 53.027292 159.081875 116.803359 216.408677 23.647306-12.89853 42.278516-23.647306 63.776068-36.545836z" p-id="1502" fill="#b8976d"></path><path d="M860.260322 532.422673c-15.048286 0-19.347796 4.29951-21.497551 19.347796-12.89853 103.904829-59.476557 193.477957-136.151154 267.286214-6.449265 6.449265-12.89853 15.048286-19.347796 23.647306 4.29951 2.149755 6.449265 2.149755 6.449265 4.29951 112.503849-42.278516 195.627712-116.803359 231.456963-231.456963 25.797061-78.824353 27.946816-78.824353-60.909727-83.123863zM510.56683 128.985304h3.582925c5.016095-21.497551 8.59902-42.995101 12.181945-64.492652 1.43317-10.748775 5.73268-21.497551 3.582926-32.246326a61.626312 61.626312 0 0 0-15.764871-32.246326h-3.582925c-9.315605 10.748775-12.89853 21.497551-15.764871 32.246326-2.149755 10.748775 2.149755 21.497551 3.582926 32.246326 2.86634 22.214136 7.16585 43.711686 12.181945 64.492652zM267.644507 159.081875c15.764871 14.3317 32.962911 27.946816 50.160951 41.561932l2.86634-2.149755c-10.03219-20.064381-20.780966-38.695591-32.246326-57.326802-5.73268-8.59902-9.315605-20.064381-17.914625-26.513646a71.013576 71.013576 0 0 0-32.246326-15.048286l-2.86634 2.866341c0 14.3317 3.582925 25.080476 8.59902 34.396081 5.016095 9.315605 15.764871 15.048286 23.647306 22.214135zM159.440168 379.073478l0.716585-3.582925c-20.064381-8.59902-40.128761-16.481456-60.909727-22.930721C89.214836 348.976907 79.182645 343.244227 68.43387 343.244227c-11.46536 0.716585-22.214136 2.149755-34.396081 10.03219l-0.716585 2.86634c8.59902 10.748775 18.631211 16.481456 28.663401 20.780966 10.03219 4.29951 21.497551 2.149755 32.246326 2.149755 21.497551 0.716585 43.711686 0.716585 65.209237 0zM989.962211 353.276417a65.639188 65.639188 0 0 0-34.396081-9.315605c-10.748775-0.716585-20.780966 5.73268-30.813156 8.59902-20.780966 6.449265-40.845346 14.3317-60.909727 22.930721l0.716585 3.582925c22.214136 1.43317 43.711686 1.43317 65.209237 0.716585 10.748775 0 22.214136 2.149755 32.246326-2.149755s20.064381-10.03219 28.663401-20.780966l-0.716585-3.582925zM756.355493 159.081875c7.882435-7.16585 17.914626-12.89853 22.930721-22.214135a64.492652 64.492652 0 0 0 8.59902-34.396081l-2.149755-2.866341a61.626312 61.626312 0 0 0-32.246326 15.048286c-8.59902 6.449265-12.181945 17.914626-17.914625 26.513646-11.46536 18.631211-22.214136 37.262421-32.246326 57.326802l2.86634 2.149755c17.198041-13.615115 34.396081-27.230231 50.160951-41.561932z" p-id="1503" fill="#b8976d"></path></svg>
          </button>
        </div>
      </Show>

      <Setting
        setting={setting}
        setSetting={setSetting}
      />
    </div>
  );
};
