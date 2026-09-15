import { Router } from 'express';
import { authRouter } from './auth.js';
import { campaignsRouter } from './campaigns.js';
import { scenesRouter } from './scenes.js';
import { tokensRouter } from './tokens.js';
import { charactersRouter } from './characters.js';
import { assetsRouter } from './assets.js';
import { handoutsRouter } from './handouts.js';
import { chatRouter } from './chat.js';
import { combatRouter } from './combat.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
apiRouter.use('/auth', authRouter);
apiRouter.use('/campaigns', campaignsRouter);
apiRouter.use('/campaigns/:campaignId/scenes', scenesRouter);
apiRouter.use('/campaigns/:campaignId/tokens', tokensRouter);
apiRouter.use('/campaigns/:campaignId/handouts', handoutsRouter);
apiRouter.use('/campaigns/:campaignId/chat', chatRouter);
apiRouter.use('/campaigns/:campaignId/combat', combatRouter);
apiRouter.use('/characters', charactersRouter);
apiRouter.use('/assets', assetsRouter);
