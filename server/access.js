import { HttpError } from './http.js';

export function hasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

export function isSystemAdmin(user) {
  return Boolean(user?.roles?.some((role) => role.code === 'system_admin'));
}

export function canManageKnowledge(user) {
  return hasPermission(user, 'knowledge.edit') || hasPermission(user, 'knowledge.create');
}

export function canReadKnowledge(db, user, knowledge) {
  if (!knowledge) return false;
  if (Number(knowledge.author_id) === Number(user.id)) return true;
  if (canManageKnowledge(user)) return true;
  if (knowledge.status !== 'published') return false;

  if (knowledge.visibility === 'public') {
    return hasPermission(user, 'knowledge.public.view');
  }
  if (knowledge.visibility === 'internal') {
    return hasPermission(user, 'knowledge.internal.view');
  }
  if (knowledge.visibility === 'restricted') {
    if (!hasPermission(user, 'knowledge.restricted.view')) return false;
    if (isSystemAdmin(user)) return true;
    const acl = db.prepare(`
      SELECT 1 FROM knowledge_acl
      WHERE knowledge_id = ? AND user_id = ?
    `).get(knowledge.id, user.id);
    return Boolean(acl);
  }
  return false;
}

export function assertCanReadKnowledge(db, user, knowledge) {
  if (!canReadKnowledge(db, user, knowledge)) {
    throw new HttpError(403, '当前账号没有查看此内容的权限', 'content_forbidden');
  }
}

export function canReadFeedback(db, user, feedback) {
  if (Number(feedback.user_id) === Number(user.id)) return true;
  if (hasPermission(user, 'feedback.review')) return true;
  return feedback.status === 'approved' && feedback.visibility === 'public';
}

export function canReadQuestion(user, question) {
  if (Number(question.user_id) === Number(user.id)) return true;
  if (hasPermission(user, 'question.manage')) return true;
  return question.is_faq === 1 && question.status !== 'pending' && question.status !== 'processing';
}

export function canReadCommunityPost(user, post) {
  if (Number(post.user_id) === Number(user.id)) return true;
  if (hasPermission(user, 'community.moderate')) return true;
  return post.status === 'published';
}

export function canManageAttachmentTarget(db, user, attachment) {
  const { target_type: targetType, target_id: targetId } = attachment;
  if (targetType === 'knowledge') {
    const knowledge = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(targetId);
    return knowledge ? canReadKnowledge(db, user, knowledge) : false;
  }
  if (targetType === 'activity') {
    const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(targetId);
    if (!activity) return false;
    if (hasPermission(user, 'activity.manage')) return true;
    return (
      hasPermission(user, 'activity.view') &&
      ['published', 'completed'].includes(activity.status)
    );
  }
  if (targetType === 'feedback') {
    const feedback = db.prepare('SELECT * FROM feedback WHERE id = ?').get(targetId);
    return feedback ? canReadFeedback(db, user, feedback) : false;
  }
  if (targetType === 'question') {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(targetId);
    return question ? canReadQuestion(user, question) : false;
  }
  if (targetType === 'community') {
    const post = db.prepare('SELECT * FROM community_posts WHERE id = ?').get(targetId);
    return post ? canReadCommunityPost(user, post) : false;
  }
  return false;
}

export function canAttachToTarget(db, user, targetType, targetId) {
  if (targetType === 'knowledge') {
    const knowledge = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(targetId);
    if (!knowledge) return false;
    return (
      Number(knowledge.author_id) === Number(user.id) ||
      hasPermission(user, 'knowledge.edit')
    );
  }
  if (targetType === 'activity') {
    return hasPermission(user, 'activity.manage');
  }
  if (targetType === 'feedback') {
    const feedback = db.prepare('SELECT * FROM feedback WHERE id = ?').get(targetId);
    return Boolean(
      feedback &&
        (Number(feedback.user_id) === Number(user.id) ||
          hasPermission(user, 'feedback.review')),
    );
  }
  if (targetType === 'question') {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(targetId);
    return Boolean(
      question &&
        (Number(question.user_id) === Number(user.id) ||
          hasPermission(user, 'question.manage')),
    );
  }
  if (targetType === 'community') {
    const post = db.prepare('SELECT * FROM community_posts WHERE id = ?').get(targetId);
    return Boolean(
      post &&
        (Number(post.user_id) === Number(user.id) ||
          hasPermission(user, 'community.moderate')),
    );
  }
  return false;
}
