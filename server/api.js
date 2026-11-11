import { HttpError, sendError, sendJson } from './http.js';
import { createAuthRoutes } from './routes/auth.js';
import { createKnowledgeRoutes } from './routes/knowledge.js';
import { createActivityRoutes } from './routes/activities.js';
import { createFeedbackRoutes } from './routes/feedback.js';
import { createQuestionRoutes } from './routes/questions.js';
import { createCommunityRoutes } from './routes/community.js';
import { createAdminRoutes } from './routes/admin.js';
import { createFileRoutes } from './routes/files.js';
import { createGeneralRoutes } from './routes/general.js';

export function createApiRouter({ db, auth, uploadDir, secureCookies }) {
  const handlers = [
    createAuthRoutes({ db, auth, secureCookies }),
    createKnowledgeRoutes({ db, auth }),
    createActivityRoutes({ db, auth }),
    createFeedbackRoutes({ db, auth }),
    createQuestionRoutes({ db, auth }),
    createCommunityRoutes({ db, auth }),
    createAdminRoutes({ db, auth }),
    createFileRoutes({ db, auth, uploadDir }),
    createGeneralRoutes({ db, auth }),
  ];

  return async function handleApi(req, res, url) {
    try {
      if (url.pathname === '/api/health' && req.method === 'GET') {
        const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
        sendJson(res, 200, {
          ok: true,
          service: 'xinqingnian-platform',
          database: 'connected',
          userCount: Number(userCount),
          time: new Date().toISOString(),
        });
        return;
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      for (const handler of handlers) {
        if (await handler(req, res, url)) return;
      }
      throw new HttpError(404, '接口不存在', 'not_found');
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendError(res, error);
    }
  };
}
