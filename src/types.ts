export interface Message {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  updatedAt: number
}
