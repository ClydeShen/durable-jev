import type { AgentId } from '@durable-jev/contracts'

interface AgentProfile {
  name: string
  description: string
  /** What the agent does, one responsibility per entry, for its card in the console. */
  responsibilities: string[]
}

/** What each Durable Jev Agent is responsible for; published in its Agent Card. */
export const agentProfiles: Record<AgentId, AgentProfile> = {
  'order-coordination': {
    name: '订单协调',
    description: '接单、汇总各 agent 结论、整单放行与调度确认',
    responsibilities: [
      '接收订单，把每个资料版本交给其他四个 agent 评估',
      '在 agent 之间传递彼此的结论，循环到结论不再变化',
      '安排仓库装载，汇总整单是否可以放行（R40）',
      '调度员确认发运时，在同一事务里再核对一次放行条件与资料版本',
    ],
  },
  'cargo-assurance': {
    name: '货物合规',
    description: '货物分类、受控与冷链检查、文件核对、整改复测',
    responsibilities: [
      '判断每件货物属于普通、冷链还是受控货物',
      '受控货物：文件是否齐全、文件与货物是否一致、承运商资质、能否混装',
      '冷链货物：温度记录、温度偏差的整改与复测',
      '组织合规审核员与质量审核员的两步审批，同一人不能签两步',
    ],
  },
  'transport-planning': {
    name: '运输计划',
    description: '路线、车辆、承运商、中转与运力预订；承运商取消时由调查助手找替代运力',
    responsibilities: [
      '检查路线衔接、车辆载重、承运商资质与中转站能力',
      '预订运力（R29，150 条规则里唯一用代码实现的一条）',
      '承运商取消时启动调查助手：查找备用运力并逐个预检规则，提出改派建议',
      '改派只能由运输计划员确认；调查助手只提议、不做决定',
    ],
  },
  'commercial-control': {
    name: '商务',
    description: '授信、报价、额外费用与客户条款',
    responsibilities: [
      '检查客户状态与授信额度，超额时交商务主管审批',
      '检查报价，额外费用超过阈值时交商务主管审批',
      '逐条检查客户合同条款（政策附录 H）',
    ],
  },
  'destination-compliance': {
    name: '目的地合规',
    description: '目的地进口要求（扩展）',
    responsibilities: [
      '由 Jev 判断每件货物属于哪些商品组；拿不准时多选，宁多勿漏',
      '按目的地与商品组挑出本单适用的进口要求（政策附录 G），其余规则直接筛掉',
      '作为扩展加入：新增这个 agent 没有修改其他 agent 的代码',
    ],
  },
}
