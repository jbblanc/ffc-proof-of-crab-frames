import { Button, FrameContext, Frog, TextInput } from 'frog';
import { devtools } from 'frog/dev';
import { serveStatic } from 'frog/serve-static';
import { neynar } from 'frog/hubs';
import { handle } from 'frog/vercel';
import {
  getPocChallenge,
  getPocFrame,
  updatePocChallengeSteps,
  updatePocChallengeWithProof,
} from '../utils/db.js';
import { buildNewChallenge, getPreviousQuestion } from '../utils/challenge.js';
import { ProofOfCrabChallenge } from '../domain/poc-challenge.js';
import { checkOwnership, mintProof } from '../utils/phosphor.js';
import { cloneCustomPocFrameFromDefault } from '../utils/frame.js';

// Uncomment to use Edge Runtime.
// export const config = {
//   runtime: 'edge',
// }

const verify = process.env.VERIFY_BODY === 'true';

export const app = new Frog({
  assetsPath: '/',
  basePath: '/api',
  imageAspectRatio: '1:1',
  verify: verify,
  hub: neynar({ apiKey: process.env.NEYNAR_APIKEY ?? '' }),
});

//app.route('/add-frame-to-account', addFrameToAccount)

app.frame('/proof-of-crab', handleHome);

app.frame('/proof-of-crab/:frameId', handleHome);

async function handleHome(c: any) {
  let { frameId } = c.req.param();
  try {
    if (!frameId) {
      frameId = process.env.DEFAULT_POC_FRAME_ID ?? '';
    }
    const pocFrame = await getPocFrame(frameId);
    // if custom frame (for later), handle any customisation here
    //....
    return renderHome(c, pocFrame.id);
  } catch (e: any) {
    console.log(e);
    return renderError(c, frameId);
  }
}

function renderHome(c: FrameContext, frameId: string) {
  const startAction = `/proof-of-crab/${frameId}/new-challenge`;
  const crabsUrl = `${process.env.APP_BASE_URL}/${frameId}`;
  return c.res({
    image:
      'https://jopwkvlrcjvsluwgyjkm.supabase.co/storage/v1/object/public/poc-images/GrabHome.png',
    intents: [
      <Button action={startAction}>▶️ Start</Button>,
      <Button.Link href={crabsUrl}>View Crabs</Button.Link>,
    ],
  });
}

function renderProofAlreadyOwned(
  c: FrameContext,
  frameId: string,
  proofPageUrl: string,
) {
  const action = frameId ? `/${frameId}` : '/';
  return c.res({
    image: renderTextImage('You already own this 🦀 proof !'),
    intents: [
      <Button action={action}>Back to Home</Button>,
      <Button.Link href={proofPageUrl}>View my 🦀 Proof</Button.Link>,
    ],
  });
}

app.frame('/proof-of-crab/:frameId/new-challenge', async (c) => {
  const { frameData, verified } = c;
  const { fid } = frameData;
  console.log('verified =>', verified);
  console.log('frameData =>', frameData);
  console.log('fid =>', fid);
  const { frameId } = c.req.param();
  const ignoreOwnershipCheck = new Boolean(
    process.env.CHALLENGE_IGNORE_OWNERSHIP_CHECK,
  );
  try {
    console.log(frameId);
    const wallet = '';

    // check ownership first
    const pocFrame = await getPocFrame(frameId);
    const alreadyOwnsProof = await checkOwnership(pocFrame, wallet);
    if (alreadyOwnsProof && !ignoreOwnershipCheck) {
      return renderProofAlreadyOwned(
        c,
        pocFrame.id,
        pocFrame.phosphor_proof_url,
      );
    } else {
      // challengeId unset => generate new one and render step/question 1
      const newChallenge = await buildNewChallenge(frameId, fid);
      return renderChallengeNextStep(c, newChallenge, 1);
    }
  } catch (e: any) {
    console.log(e);
    return renderError(c, frameId);
  }
});

app.frame('/proof-of-crab/challenge/:challengeId', async (c) => {
  const { buttonValue, inputText, status } = c;
  const { challengeId } = c.req.param();
  try {
    const previousAnswer = buttonValue;
    console.log(
      `Received answer: ${previousAnswer} for challenge ${challengeId}`,
    );
    if (!challengeId) {
      // challengeId unset => throw ERROR or show ERROR frame
      throw new Error('Challenge not found');
    }
    // challengeId set => fetch challenge with current state, get previous value, set score for previous step and show next step (if any), if no next step, show summary
    let challenge = await getPocChallenge(challengeId);
    // find challenge question to update with previousAnswer
    const answeredQuestion = getPreviousQuestion(challenge);
    console.log(
      `Answering step ${answeredQuestion.position} and rendering next step (if any)`,
    );
    answeredQuestion.selected_answer = previousAnswer;
    answeredQuestion.is_valid_answer =
      answeredQuestion.selected_answer?.toLocaleLowerCase() ===
      answeredQuestion.question.correct_answer.toLowerCase();
    answeredQuestion.answered_at = new Date();
    console.log(`Answering valid ? : ${answeredQuestion.is_valid_answer}`);
    // checking if all steps/questions are completed
    const allAnsweredQuestionsSoFar = challenge.steps.questions.filter(
      (q) => q.selected_answer,
    );
    if (allAnsweredQuestionsSoFar.length === challenge.steps.total_steps) {
      console.log(
        `All answers have been given for challenge ${challenge.id}, calculting score`,
      );
      // calculating score
      let allAnswersAreValid = true;
      challenge.steps.questions.map((q) => {
        allAnswersAreValid = allAnswersAreValid && (q.is_valid_answer ?? false);
      });
      challenge.score = allAnswersAreValid ? 'PASSED' : 'FAILED';
      console.log(`Score for challenge ${challenge.id} is ${challenge.score}`);
    }
    challenge = await updatePocChallengeSteps(challenge);

    if (challenge.score === 'PASSED') {
      return renderChallengePassed(c, challenge);
    } else if (challenge.score === 'FAILED') {
      return renderChallengeFailed(c, challenge);
    } else {
      // moving to next question
      return renderChallengeNextStep(
        c,
        challenge,
        answeredQuestion.position + 1,
      );
    }
  } catch (e: any) {
    console.log(e);
    return renderError(c);
  }
});

function renderChallengeNextStep(
  c: FrameContext,
  challenge: ProofOfCrabChallenge,
  stepToRender: number,
) {
  console.log(
    `Now moving to step ${stepToRender} for challenge ${challenge.id}`,
  );
  const question = challenge.steps.questions[stepToRender - 1].question;
  const btn1Value = question.proposed_answers[0];
  const btn2Value = question.proposed_answers[1];
  const btn3Value = question.proposed_answers[2];
  const btn4Value = question.proposed_answers[3];
  return c.res({
    action: `/proof-of-crab/challenge/${challenge.id}`,
    image: question.image_url ?? '',
    intents: [
      <Button value={btn1Value}>{btn1Value}</Button>,
      <Button value={btn2Value}>{btn2Value}</Button>,
      <Button value={btn3Value}>{btn3Value}</Button>,
      <Button value={btn4Value}>{btn4Value}</Button>,
    ],
  });
}

function renderChallengePassed(
  c: FrameContext,
  challenge: ProofOfCrabChallenge,
) {
  const actionMintProof = `/proof-of-crab/challenge/${challenge.id}/proof`;
  return c.res({
    image:
      'https://jopwkvlrcjvsluwgyjkm.supabase.co/storage/v1/object/public/poc-images/CrabPass.png?t=2024-04-15T17%3A51%3A47.863Z',
    intents: [
      <TextInput placeholder="Enter external wallet..." />,
      <Button action={actionMintProof} value="mint">
        Mint your 🦀 Proof
      </Button>,
    ],
  });
}

function renderChallengeFailed(
  c: FrameContext,
  challenge: ProofOfCrabChallenge,
) {
  const actionRetryChallenge = `/proof-of-crab/${challenge.frame_id}/new-challenge`;
  return c.res({
    image:
      'https://jopwkvlrcjvsluwgyjkm.supabase.co/storage/v1/object/public/poc-images/CrabFail.png?t=2024-04-15T07%3A36%3A34.523Z',
    intents: [
      <Button action={actionRetryChallenge} value="retry">
        Try again
      </Button>,
    ],
  });
}

function renderProofMinted(
  c: FrameContext,
  challenge: ProofOfCrabChallenge,
  proofPageUrl: string,
) {
  return c.res({
    image: renderTextImage(`Proof minted - tx hash: ${challenge.mint_tx_hash}`),
    intents: [<Button.Link href={proofPageUrl}>View my 🦀 Proof</Button.Link>],
  });
}

app.frame('/proof-of-crab/challenge/:challengeId/proof', async (c) => {
  try {
    const { inputText } = c;
    const { challengeId } = c.req.param();
    const fid = '1345';
    const fidWalletAddress = '1345';
    if (!challengeId) {
      throw new Error('Challenge not found');
    }
    let challenge = await getPocChallenge(challengeId);
    const pocFrame = await getPocFrame(challenge.frame_id);
    //TODO get FID + wallet address
    const txHash = await mintProof(pocFrame, inputText ?? fidWalletAddress);
    challenge.mint_tx_hash = txHash;
    challenge.has_minted_proof = txHash !== null;
    await updatePocChallengeWithProof(challenge);
    return renderProofMinted(c, challenge, pocFrame.phosphor_proof_url);
  } catch (e: any) {
    console.log(e);
    return renderError(c);
  }
});

function renderTextImage(text: string) {
  return (
    <div
      style={{
        alignItems: 'center',
        background: 'black',
        backgroundSize: '100% 100%',
        display: 'flex',
        flexDirection: 'column',
        flexWrap: 'nowrap',
        height: '100%',
        justifyContent: 'center',
        textAlign: 'center',
        width: '100%',
      }}
    >
      <div
        style={{
          color: 'white',
          fontSize: 40,
          fontStyle: 'normal',
          letterSpacing: '-0.025em',
          lineHeight: 1.4,
          marginTop: 30,
          padding: '0 120px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function renderError(c: FrameContext, frameId?: string) {
  const action = frameId ? `/proof-of-crab/${frameId}` : '/proof-of-crab';
  return c.res({
    image:
      'https://jopwkvlrcjvsluwgyjkm.supabase.co/storage/v1/object/public/poc-images/CrabError.png?t=2024-04-15T13%3A25%3A37.729Z',
    intents: [<Button action={action}>Back to Home</Button>],
  });
}
/*
app.frame('/add-proof-to-account', async (c) => {
  const hrefDefault = `https://warpcast.com/~/compose?embeds[]=${process.env.BASE_URL}/api`;
  //const hrefCustom = `${process.env.APP_BASE_URL}/new`;
  const actionCustom = `/add-proof-to-account/clone`;
  return c.res({
    image:
      'https://jopwkvlrcjvsluwgyjkm.supabase.co/storage/v1/object/public/poc-images/GrabHome.png',
    intents: [
      <Button.Link href={hrefDefault}>Use 🦀 with my account</Button.Link>,
      //<Button.Link href={hrefCustom}>Setup a custom 🦀</Button.Link>,
      <Button action={actionCustom}>Setup a custom 🦀</Button>,
    ],
  });
});

app.frame('/add-proof-to-account/clone', async (c) => {
  const defaultPocFrame = await getPocFrame(
    process.env.DEFAULT_POC_FRAME_ID ?? '',
  );
  const pocFrameClone = await cloneCustomPocFrameFromDefault(
    defaultPocFrame,
    '12345',
    '0xInfluencer',
  );
  const hrefDefault = `https://warpcast.com/~/compose?embeds[]=${process.env.BASE_URL}/api/proof-of-crab/${pocFrameClone.id}`;
  return c.res({
    //TODO change image with... your proof has been prepared, now activate it by clicking button
    image:
      'https://jopwkvlrcjvsluwgyjkm.supabase.co/storage/v1/object/public/poc-images/GrabHome.png',
    intents: [
      <Button.Link href={hrefDefault}>Activate 🦀 on my account</Button.Link>,
    ],
  });
});
*/

app.frame('/add-frame-to-account', async (c) => {
  try {
    const hrefDefault = `https://warpcast.com/~/compose?embeds[]=${process.env.BASE_URL}/api`;
    //const hrefCustom = `${process.env.APP_BASE_URL}/new`;
    const actionCustom = `/add-frame-to-account/clone`;
    return c.res({
      image:
        'https://jopwkvlrcjvsluwgyjkm.supabase.co/storage/v1/object/public/poc-images/GrabHome.png',
      intents: [
        <Button.Link href={hrefDefault}>Use 🦀 with my account</Button.Link>,
        //<Button.Link href={hrefCustom}>Setup a custom 🦀</Button.Link>,
        <Button action={actionCustom}>Setup a custom 🦀</Button>,
      ],
    });
  } catch (e: any) {
    console.log(e);
    return renderError2(c);
  }
});

app.frame('/add-frame-to-account/clone', async (c) => {
  try {
    const { frameData, verified } = c;
    const { fid } = frameData;
    const allowMultipleForSameFid = new Boolean(
      process.env.FRAME_ALLOW_MULTIPLE_FOR_SAME_FID,
    );
    const defaultPocFrame = await getPocFrame(
      process.env.DEFAULT_POC_FRAME_ID ?? '',
    );
    //TODO fetch other frames for this fid
    if (!allowMultipleForSameFid) {
      //TODO if other frame exists, then return rendered blocker message => you can't create 2 frames
    }
    const pocFrameClone = await cloneCustomPocFrameFromDefault(
      defaultPocFrame,
      fid,
      '0xInfluencer',
    );
    const hrefDefault = `https://warpcast.com/~/compose?embeds[]=${process.env.BASE_URL}/api/proof-of-crab/${pocFrameClone.id}`;
    return c.res({
      //TODO change image with... your proof has been prepared, now activate it by clicking button
      image:
        'https://jopwkvlrcjvsluwgyjkm.supabase.co/storage/v1/object/public/poc-images/GrabHome.png',
      intents: [
        <Button.Link href={hrefDefault}>Activate 🦀 on my account</Button.Link>,
      ],
    });
  } catch (e: any) {
    console.log(e);
    return renderError2(c);
  }
});

function renderError2(c: FrameContext, frameId?: string) {
  const action = '/add-frame-to-account';
  return c.res({
    image:
      'https://jopwkvlrcjvsluwgyjkm.supabase.co/storage/v1/object/public/poc-images/CrabError.png?t=2024-04-15T13%3A25%3A37.729Z',
    intents: [<Button action={action}>Back</Button>],
  });
}

// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== 'undefined';
const isProduction = isEdgeFunction || import.meta.env?.MODE !== 'development';
devtools(app, isProduction ? { assetsPath: '/.frog' } : { serveStatic });

export const GET = handle(app);
export const POST = handle(app);
