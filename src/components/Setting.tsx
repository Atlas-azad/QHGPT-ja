import {
  Accessor,
  createSignal,
  JSXElement,
  Setter,
  Show
} from "solid-js"

import IconEnv from './icons/Env'

// 新增：模型提供商类型
type ModelProvider = 'siliconflow' | '302ai';

// 修改：扩展 Setting 类型
interface Setting {
  modelProvider: ModelProvider; // 新增：模型提供商
  siliconflowAPIKey: string;   // 修改：原 openaiAPIKey，更名使其清晰
  threeohtwoAPIKey: string;    // 新增：302.AI 的 API Key
  customRule: string;
  openaiAPITemperature: number;
  roleAvatar?: string;
}

export default function Setting(props: {
  setting: Accessor<Setting>
  setSetting: Setter<Setting>
}) {
  const [shown, setShown] = createSignal(false)

  // 新增：一个方便的函数来更新 provider
  const handleProviderChange = (provider: ModelProvider) => {
    props.setSetting({
      ...props.setting(),
      modelProvider: provider
    });
  };
  
  return (
    <div class="text-sm text-slate mb-2">
      <div class="mt-2 flex items-center justify-between">
        <div
          class="flex items-center cursor-pointer hover:text-slate-3 "
          onClick={() => {
            setShown(!shown())
          }}
        >
          <IconEnv />
          <span ml-1>拈花</span>
        </div>
      </div>
      <hr class="mt-2 bg-slate-5 bg-op-15 border-none h-1px"></hr>
      <Show when={shown()}>
        {/* 新增：模型提供商选择器 */}
        <SettingItem icon="i-carbon:cloud-service-management" label="模型来源">
          <div class="flex items-center space-x-2">
            <label class="flex items-center cursor-pointer">
              <input 
                type="radio" 
                name="modelProvider" 
                checked={props.setting().modelProvider === 'siliconflow'} 
                onChange={() => handleProviderChange('siliconflow')}
                class="form-radio h-4 w-4 text-blue-600"
              />
              <span class="ml-2">硅基流动</span>
            </label>
            <label class="flex items-center cursor-pointer">
              <input 
                type="radio" 
                name="modelProvider" 
                checked={props.setting().modelProvider === '302ai'} 
                onChange={() => handleProviderChange('302ai')}
                class="form-radio h-4 w-4 text-blue-600"
              />
              <span class="ml-2">302.AI</span>
            </label>
          </div>
        </SettingItem>

        {/* 修改：根据选择显示不同的 API Key 输入框 */}
        <Show when={props.setting().modelProvider === 'siliconflow'}>
          <SettingItem icon="i-carbon:api" label="硅基流动 Key">
            <input
              type="password"
              placeholder="请看下方【告示】说明"
              value={props.setting().siliconflowAPIKey}
              class="max-w-200px ml-1em px-1 text-slate rounded-sm bg-slate bg-op-15 focus:bg-op-20 focus:ring-0 focus:outline-none placeholder:text-slate-400 placeholder:op-30"
              onInput={e => {
                props.setSetting({
                  ...props.setting(),
                  siliconflowAPIKey: (e.target as HTMLInputElement).value
                })
              }}
            />
          </SettingItem>
        </Show>
        <Show when={props.setting().modelProvider === '302ai'}>
          <SettingItem icon="i-carbon:api" label="302.AI Key">
            <input
              type="password"
              placeholder="在此输入 302.AI 的 Key"
              value={props.setting().threeohtwoAPIKey}
              class="max-w-200px ml-1em px-1 text-slate rounded-sm bg-slate bg-op-15 focus:bg-op-20 focus:ring-0 focus:outline-none placeholder:text-slate-400 placeholder:op-30"
              onInput={e => {
                props.setSetting({
                  ...props.setting(),
                  threeohtwoAPIKey: (e.target as HTMLInputElement).value
                })
              }}
            />
          </SettingItem>
        </Show>
        
        <SettingItem icon="i-carbon:user-online" label="自定义角色">
          <input
            type="text"
            value={props.setting().customRule}
            class="text-ellipsis  max-w-200px ml-1em px-1 text-slate rounded-sm bg-slate bg-op-15 focus:bg-op-20 focus:ring-0 focus:outline-none placeholder:text-slate-400 placeholder:op-30"
            onInput={e => {
              props.setSetting({
                ...props.setting(),
                customRule: (e.target as HTMLInputElement).value
              })
            }}
          />
        </SettingItem>
      </Show>
    </div>
  )
}

function SettingItem(props: {
  children: JSXElement
  icon: string
  label: string
}) {
  return (
    <div class="flex items-center hover:text-slate-3 mt-2 justify-between">
      <div class="flex items-center">
        <button class={props.icon} />
        <span ml-1>{props.label}</span>
      </div>
      {props.children}
    </div>
  )
}
