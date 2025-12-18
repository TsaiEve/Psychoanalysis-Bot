
export enum Role {
  USER = 'user',
  MODEL = 'model',
}

export interface Message {
  role: Role;
  content: string;
}
