import { FarcasterUser } from './farcaster-user.js';
import { ProofOfCrabChallengeQuestion } from './poc-challenge-question.js';

export interface ProofOfCrabChallenge {
  id?: string;
  frame_id: string;
  fid?: string;
  user?: FarcasterUser;
  steps: { questions: ProofOfCrabChallengeQuestion[]; total_steps: number };
  score?: string; // PASSED, FAILED, NOT_COMPLETED
  has_minted_proof?: boolean;
  mint_tx_id?: string;
  created_at?: Date;
}
