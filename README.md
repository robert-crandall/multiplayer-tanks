# Tanks Game

A browser-based multiplayer artillery game inspired by Scorched Earth. The game allows 2–8 players to connect and take turns firing projectiles using angle and power inputs, with future support for wind, weapons, and terrain deformation.

## Project Setup

To get started, install the project dependencies:

```bash
npm install
```

## Running the Game

You can run both the frontend and backend servers with a single command:

```bash
npm start
```

This will concurrently start:
- The SvelteKit frontend on http://localhost:5173
- The Socket.IO backend server on http://localhost:3001

## Development

For separate development workflows, you can run the frontend and backend individually:

```bash
# Start just the frontend
npm run dev

# Start just the backend
npm run server
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
