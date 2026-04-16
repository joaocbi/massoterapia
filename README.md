# Luxor Massoterapia

Premium massotherapy website with:

- golden landing page
- online booking flow
- admin modal
- SQLite persistence
- Mercado Pago checkout integration
- GitHub Pages deployment for the frontend

## Stack

- Frontend: `HTML`, `CSS`, `JavaScript`
- Backend: `Node.js`, `Express`
- Database: `SQLite`
- Payments: `Mercado Pago`

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy `env.example` to `.env` and adjust the values.

3. Start the server:

```bash
npm start
```

4. Open:

[`http://localhost:3000`](http://localhost:3000)

## Environment variables

- `PORT`: backend port
- `ADMIN_PASSWORD`: required password used by the admin modal
- `FRONTEND_ORIGIN`: allowed frontend origin for CORS
- `PUBLIC_SITE_URL`: public backend URL used in Mercado Pago callbacks
- `MERCADO_PAGO_ACCESS_TOKEN`: Mercado Pago private token
- `MERCADO_PAGO_PUBLIC_KEY`: optional public key for future frontend use

## Frontend config

Edit `site-config.js` before publishing the static website on GitHub Pages.

Example:

```javascript
window.LUXOR_CONFIG = {
  apiBaseUrl: "https://your-backend-url.onrender.com",
};
```

The admin password must stay only in the backend environment.

## Security notes

- Do not expose `ADMIN_PASSWORD` in `site-config.js`, `index.html`, or any public frontend file
- Use a strong `ADMIN_PASSWORD` in production
- Set `FRONTEND_ORIGIN` to the exact allowed frontend URL, or multiple URLs separated by commas

## GitHub Pages

The repository includes a workflow in `.github/workflows/deploy-pages.yml`.

It deploys:

- `index.html`
- `styles.css`
- `script.js`
- `site-config.js`

## Backend deploy

The repository includes `render.yaml` as a ready starting point for Render deployment.

## Mercado Pago

To enable real Mercado Pago checkout:

1. Add `MERCADO_PAGO_ACCESS_TOKEN` to the backend environment
2. Set `PUBLIC_SITE_URL` to the public backend URL
3. Configure the frontend `apiBaseUrl` in `site-config.js`

## Notes

- Local storage was replaced by real API persistence
- Appointment availability is validated on the server
- Mercado Pago webhook updates payment status automatically when configured

## Operation guide

For day-to-day usage by client and administrator, see:

- `README-OPERACAO.md`
