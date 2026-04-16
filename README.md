# howethstudio.com-backend

Small Express API for Howeth Studio: health checks, CORS for the static marketing site, and a contact endpoint you can wire to email or a helpdesk later.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

- Health: `GET http://localhost:8787/health`
- Contact (stub): `POST http://localhost:8787/api/contact` with JSON `{ "name", "email", "subject", "message" }`

## Deploy (Render)

Create a **Web Service** with root directory `backend` (or deploy this repository alone), start command `npm start`, and set `FRONTEND_ORIGIN` to your real site origin(s).

## Connect the marketing contact form

Set `NEXT_PUBLIC_CARENOTE_SUPPORT_FORM_ENDPOINT` on the frontend to your deployed URL plus `/api/contact` (for example `https://api.howethstudio.com/api/contact`).
