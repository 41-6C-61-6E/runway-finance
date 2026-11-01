export type AiProposal = {
  id: string;
  type: 'categorize' | 'create_category' | 'create_rule';
  status: 'pending' | 'approved' | 'applied' | 'rejected';
  confidence: string | null;
  payload: any;
  explanation: string | null;
  createdAt: string;
  transactionDetails?: {
    payee: string | null;
    date: string;
    amount: string;
    accountName: string | null;
    accountTags?: { id: string; name: string; color: string }[];
  };
};

export type Category = {
  id: string;
  name: string;
  isIncome: boolean;
  parentId: string | null;
  color: string;
};
