const ADMIN_GROUP_DICTIONARY = [
  'admin',
  'desenvolvedor',
  'franqueadora',
  'recursos humanos'
];

function normalizeGroupName(groupName) {
  return String(groupName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveRoleFromGroup(groupName) {
  const normalizedGroup = normalizeGroupName(groupName);
  const isAdminGroup = ADMIN_GROUP_DICTIONARY.some((entry) => normalizedGroup.includes(entry));
  return isAdminGroup ? 'admin' : 'user';
}

module.exports = {
  ADMIN_GROUP_DICTIONARY,
  normalizeGroupName,
  resolveRoleFromGroup
};
