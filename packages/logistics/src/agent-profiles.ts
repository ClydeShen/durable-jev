import type { AgentId } from '@durable-jev/contracts'

/** What each Durable Jev Agent is responsible for; published in its Agent Card. */
export const agentProfiles: Record<AgentId, { name: string; description: string }> = {
  'order-coordination': {
    name: '订单协调',
    description: '接单、汇总各 agent 结论、整单放行与调度确认',
  },
  'cargo-assurance': {
    name: '货物合规',
    description: '货物分类、受控与冷链检查、文件核对、整改复测',
  },
  'transport-planning': {
    name: '运输计划',
    description: '路线、车辆、承运商、中转与运力预订；承运商取消时由调查助手找替代运力',
  },
  'commercial-control': {
    name: '商务',
    description: '授信、报价、额外费用与客户条款',
  },
  'destination-compliance': {
    name: '目的地合规',
    description: '目的地进口要求（扩展）',
  },
}
