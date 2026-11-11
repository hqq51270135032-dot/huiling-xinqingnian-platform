import {
  HttpError,
  sendJson,
} from '../http.js';
import { canReadKnowledge } from '../access.js';

function safeIncludes(value, query) {
  return String(value || '').toLowerCase().includes(query);
}

export function createGeneralRoutes({ db, auth }) {
  return async function handle(req, res, url) {
    if (url.pathname === '/api/home' && req.method === 'GET') {
      const user = auth.requireUser(req);
      const knowledgeRows = db.prepare(`
        SELECT k.*, u.display_name AS author_name
        FROM knowledge k
        JOIN users u ON u.id = k.author_id
        WHERE k.status = 'published'
        ORDER BY COALESCE(k.published_at, k.updated_at) DESC
      `).all().filter((row) => canReadKnowledge(db, user, row));

      const activities = db.prepare(`
        SELECT a.*, u.display_name AS creator_name,
               (SELECT COUNT(*) FROM activity_participants p
                WHERE p.activity_id = a.id AND p.status = 'joined') AS participant_count
        FROM activities a
        JOIN users u ON u.id = a.created_by
        WHERE a.status = 'published'
        ORDER BY a.starts_at ASC
        LIMIT 4
      `).all().map((row) => ({
        id: Number(row.id),
        title: row.title,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        location: row.location,
        introduction: row.introduction,
        participantCount: Number(row.participant_count),
        status: row.status,
        isJoined: Boolean(db.prepare(`
          SELECT 1 FROM activity_participants
          WHERE activity_id = ? AND user_id = ? AND status = 'joined'
        `).get(row.id, user.id)),
      }));

      const pendingFeedback = db.prepare(`
        SELECT a.id, a.title, a.starts_at, a.location
        FROM activities a
        JOIN activity_participants p ON p.activity_id = a.id
        WHERE p.user_id = ? AND p.status = 'joined' AND a.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM feedback f
            WHERE f.activity_id = a.id AND f.user_id = ?
          )
        ORDER BY a.starts_at DESC
      `).all(user.id, user.id).map((row) => ({
        id: Number(row.id),
        title: row.title,
        startsAt: row.starts_at,
        location: row.location,
      }));

      const faqs = db.prepare(`
        SELECT q.*, u.display_name AS user_name,
               answerer.display_name AS answerer_name
        FROM questions q
        JOIN users u ON u.id = q.user_id
        LEFT JOIN users answerer ON answerer.id = q.answered_by
        WHERE q.is_faq = 1 AND q.status IN ('replied', 'archived')
        ORDER BY q.answered_at DESC
        LIMIT 4
      `).all();

      const posts = db.prepare(`
        SELECT p.*, u.display_name AS user_name,
               a.title AS activity_title,
               (SELECT COUNT(*) FROM comments c
                WHERE c.post_id = p.id AND c.status = 'published') AS comment_count
        FROM community_posts p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN activities a ON a.id = p.activity_id
        WHERE p.status = 'published'
        ORDER BY p.created_at DESC
        LIMIT 3
      `).all().map((row) => ({
        id: Number(row.id),
        title: row.title,
        content: row.content,
        category: row.category,
        userName: row.user_name,
        createdAt: row.created_at,
        commentCount: Number(row.comment_count),
      }));

      const learnedCount = db.prepare(
        'SELECT COUNT(*) AS count FROM reading_history WHERE user_id = ?',
      ).get(user.id).count;
      const favoriteCount = db.prepare(
        'SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?',
      ).get(user.id).count;
      const knowledgeCards = knowledgeRows.slice(0, 6).map((row) => ({
        id: Number(row.id),
        title: row.title,
        summary: row.summary,
        category: row.category,
        tags: String(row.tags || '').split(',').filter(Boolean),
        visibility: row.visibility,
        viewCount: Number(row.view_count),
        publishedAt: row.published_at || row.updated_at,
        authorName: row.author_name,
      }));
      const recommended = knowledgeRows
        .filter((row) => ['基础认知', '沟通技巧', '服务规范'].includes(row.category))
        .slice(0, 3)
        .map((row) => ({
          id: Number(row.id),
          title: row.title,
          summary: row.summary,
          category: row.category,
          visibility: row.visibility,
        }));

      sendJson(res, 200, {
        stats: {
          learnedCount: Number(learnedCount),
          favoriteCount: Number(favoriteCount),
          pendingFeedbackCount: pendingFeedback.length,
        },
        knowledge: knowledgeCards,
        recommended,
        activities,
        pendingFeedback,
        faqs: faqs.map((row) => ({
          id: Number(row.id),
          title: row.title,
          answer: row.answer,
          category: row.category,
          answererName: row.answerer_name || '',
          answeredAt: row.answered_at,
        })),
        posts,
      });
      return true;
    }

    if (url.pathname === '/api/search' && req.method === 'GET') {
      const user = auth.requireUser(req);
      const query = String(url.searchParams.get('q') || '').trim();
      if (query.length < 2) {
        throw new HttpError(400, '请输入至少两个字符进行搜索', 'query_too_short');
      }
      const normalized = query.toLowerCase();
      const knowledge = db.prepare(`
        SELECT k.*, u.display_name AS author_name
        FROM knowledge k
        JOIN users u ON u.id = k.author_id
        WHERE k.status = 'published'
        ORDER BY k.published_at DESC
      `).all()
        .filter((row) => canReadKnowledge(db, user, row))
        .filter((row) => safeIncludes(
          `${row.title} ${row.summary} ${row.content} ${row.category} ${row.tags}`,
          normalized,
        ))
        .slice(0, 8)
        .map((row) => ({
          id: Number(row.id),
          title: row.title,
          summary: row.summary,
          category: row.category,
          visibility: row.visibility,
        }));

      const activities = db.prepare(`
        SELECT * FROM activities
        WHERE status IN ('published', 'completed')
        ORDER BY starts_at DESC
      `).all()
        .filter((row) => safeIncludes(
          `${row.title} ${row.location} ${row.introduction} ${row.content}`,
          normalized,
        ))
        .slice(0, 6)
        .map((row) => ({
          id: Number(row.id),
          title: row.title,
          startsAt: row.starts_at,
          location: row.location,
          status: row.status,
        }));

      const questions = db.prepare(`
        SELECT * FROM questions
        WHERE is_faq = 1 AND status IN ('replied', 'archived')
        ORDER BY answered_at DESC
      `).all()
        .filter((row) => safeIncludes(
          `${row.title} ${row.content} ${row.answer} ${row.category}`,
          normalized,
        ))
        .slice(0, 6)
        .map((row) => ({
          id: Number(row.id),
          title: row.title,
          category: row.category,
        }));

      const community = db.prepare(`
        SELECT p.*, u.display_name AS user_name
        FROM community_posts p
        JOIN users u ON u.id = p.user_id
        WHERE p.status = 'published'
        ORDER BY p.created_at DESC
      `).all()
        .filter((row) => safeIncludes(`${row.title} ${row.content} ${row.category}`, normalized))
        .slice(0, 6)
        .map((row) => ({
          id: Number(row.id),
          title: row.title,
          category: row.category,
          userName: row.user_name,
        }));

      sendJson(res, 200, {
        query,
        knowledge,
        activities,
        questions,
        community,
        total: knowledge.length + activities.length + questions.length + community.length,
      });
      return true;
    }

    if (url.pathname === '/api/metadata' && req.method === 'GET') {
      auth.requireUser(req);
      sendJson(res, 200, {
        knowledgeCategories: [
          '基础认知',
          '沟通技巧',
          '服务规范',
          '常见问题',
          '服务案例',
          '实践经验',
          '内部培训',
          '受限案例',
        ],
        questionCategories: [
          '心智障碍基础认知',
          '沟通与互动',
          '行为理解',
          '情绪支持',
          '活动参与',
          '服务规范',
          '志愿者自身困惑',
          '其他问题',
        ],
        communityCategories: ['经验分享', '活动心得', '改进建议', '问题讨论'],
        activityStatuses: [
          { value: 'draft', label: '草稿' },
          { value: 'published', label: '已发布' },
          { value: 'completed', label: '已结束' },
          { value: 'cancelled', label: '已取消' },
        ],
      });
      return true;
    }

    return false;
  };
}
