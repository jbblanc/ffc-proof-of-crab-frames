# Proof of Crabs (farcaster frames)

This repository is associated to a simple web application used to access + use the frame, and monitor all frames created.
It can be accessed at https://github.com/jbblanc/ffc-proof-of-crab-app

## Accessing official version

Cast the root frame and start using it in Warpcast : [Cast to Warpcast](https://warpcast.com/~/compose?embeds[]=https://ffc-proof-of-crab-frames.vercel.app/api)

Web App: Head to [Proof of Crab](https://ffc-proof-of-crab-app.vercel.app)

This app uses [Frog](https://frog.fm) framework, a [Supabase](https://supabase.com) backend and runs with [Vercel](https://vercel.com).

The following Consensys products are intensively used by the frame(s) : [Phosphor](https://www.phosphor.xyz), [Linea](https://linea.build), [Infura](https://www.infura.io) - via Phosphor

Application uses 3 tables to store resources :
- poc_frame: stores all frames (main one + all others generated by user)
- poc_frame_challenge: tracks each challenge taken by a user (which frame, which questions, which score, whether user minted proof)
- poc_question: static list of questions+answer available for random pick when starting a new challenge

In addition, static images are stored in 3 different buckets :
- poc-questions: images used for questions during the challenges
- poc-proof-artworks: new NFT artworks generated when user creates a new custome frame
- poc-images: any other image used by the frames

## Running locally

### Important note

This app requires a supabase application to run locally. This part of the application is not shared at the moment.

```
npm install
npm run dev
```

Head to http://localhost:5173/api
