This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Interview models — GemmaAI-Alt

The four interview LLM tasks use Gemma 4 through the Google Gemini API with the
existing server-side `GOOGLE_GEMINI_API_KEY`. Model selection is centralized in
`src/lib/interview/models.ts`:

| Task | Model | Selection rationale |
| --- | --- | --- |
| Interview questions | `gemma-4-26b-a4b-it` | MoE model for efficient question generation |
| Answer grading | `gemma-4-26b-a4b-it` | Interactive scoring within the existing grading deadline |
| Code analysis | `gemma-4-31b-it` | Dense model for correctness, complexity, and code review |
| Final reports | `gemma-4-26b-a4b-it` | MoE model for efficient synthesis of the interview transcript |

The configured key's model catalog exposed these two Gemma variants, both with
`generateContent` support. The tasks therefore share models by complexity rather
than using unavailable model IDs. These routes have no Gemini or Groq fallback.
Hosted Gemma models still have Google API quotas and rate limits.

Generation uses Gemma 4's supported `thinkingLevel: "minimal"` setting to limit
reasoning latency. The Gemini 2.5-specific `thinkingBudget` option is not sent.

Resume processing retains its existing Gemini implementation. Speech
transcription and text-to-speech retain their existing providers and behavior.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
