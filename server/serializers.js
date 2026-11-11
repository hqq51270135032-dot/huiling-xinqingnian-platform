import { toTagsArray } from './http.js';

export function serializeUser(user) {
  return {
    id: Number(user.id),
    username: user.username,
    displayName: user.display_name ?? user.displayName,
    email: user.email || '',
    phone: user.phone || '',
    phoneVerifiedAt: user.phone_verified_at ?? user.phoneVerifiedAt ?? null,
    bio: user.bio || '',
    status: user.status,
    createdAt: user.created_at ?? user.createdAt,
    updatedAt: user.updated_at ?? user.updatedAt,
    lastLoginAt: user.last_login_at ?? user.lastLoginAt ?? null,
    roles: user.roles || [],
    permissions: user.permissions || [],
    isAdmin: Boolean(user.isAdmin),
  };
}

export function serializeKnowledge(row, extra = {}) {
  return {
    id: Number(row.id),
    title: row.title,
    summary: row.summary,
    content: row.content,
    category: row.category,
    tags: toTagsArray(row.tags),
    visibility: row.visibility,
    status: row.status,
    authorId: Number(row.author_id),
    authorName: row.author_name || '',
    reviewerId: row.reviewer_id ? Number(row.reviewer_id) : null,
    reviewerName: row.reviewer_name || '',
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at || null,
    viewCount: Number(row.view_count || 0),
    sourceType: row.source_type || null,
    sourceId: row.source_id ? Number(row.source_id) : null,
    isFavorite: Boolean(extra.isFavorite),
    readCount: Number(extra.readCount || 0),
    lastReadAt: extra.lastReadAt || null,
    attachments: extra.attachments || [],
    aclUserIds: (extra.aclUserIds || []).map(Number),
  };
}

export function serializeActivity(row, extra = {}) {
  return {
    id: Number(row.id),
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    introduction: row.introduction,
    content: row.content,
    requirements: row.requirements,
    notes: row.notes,
    status: row.status,
    createdBy: Number(row.created_by),
    creatorName: row.creator_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participantCount: Number(row.participant_count || 0),
    isJoined: Boolean(extra.isJoined),
    hasFeedback: Boolean(extra.hasFeedback),
    myFeedbackId: extra.myFeedbackId ? Number(extra.myFeedbackId) : null,
    attachments: extra.attachments || [],
  };
}

export function serializeFeedback(row, extra = {}) {
  return {
    id: Number(row.id),
    activityId: Number(row.activity_id),
    activityTitle: row.activity_title || '',
    userId: Number(row.user_id),
    userName: row.user_name || '',
    participationDate: row.participation_date,
    problems: row.problems,
    observations: row.observations,
    communicationDifficulties: row.communication_difficulties,
    learnings: row.learnings,
    newUnderstanding: row.new_understanding,
    suggestions: row.suggestions,
    additional: row.additional,
    status: row.status,
    visibility: row.visibility,
    reviewerId: row.reviewer_id ? Number(row.reviewer_id) : null,
    reviewerName: row.reviewer_name || '',
    reviewNote: row.review_note || '',
    adminReply: row.admin_reply || '',
    tags: toTagsArray(row.tags),
    featured: Boolean(row.featured),
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at || null,
    attachments: extra.attachments || [],
  };
}

export function serializeQuestion(row, extra = {}) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    userName: row.user_name || '',
    title: row.title,
    content: row.content,
    category: row.category,
    status: row.status,
    answer: row.answer || '',
    answeredBy: row.answered_by ? Number(row.answered_by) : null,
    answererName: row.answerer_name || '',
    answeredAt: row.answered_at || null,
    isFaq: Boolean(row.is_faq),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: extra.attachments || [],
  };
}

export function serializePost(row, extra = {}) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    userName: row.user_name || '',
    activityId: row.activity_id ? Number(row.activity_id) : null,
    activityTitle: row.activity_title || '',
    title: row.title,
    content: row.content,
    category: row.category,
    status: row.status,
    reviewNote: row.review_note || '',
    reviewerId: row.reviewer_id ? Number(row.reviewer_id) : null,
    reviewerName: row.reviewer_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at || null,
    commentCount: Number(row.comment_count || 0),
    comments: extra.comments || [],
    attachments: extra.attachments || [],
  };
}

export function serializeAttachment(row) {
  return {
    id: Number(row.id),
    targetType: row.target_type,
    targetId: Number(row.target_id),
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
    url: `/api/files/${row.id}`,
  };
}
