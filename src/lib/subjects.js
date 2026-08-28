export const SUBJECTS = [
  { id: 'dld', code: 'DLD', name: 'Digital Logic Design' },
  { id: 'elx', code: 'ELX', name: 'Electronics' },
  { id: 'dm',  code: 'DM',  name: 'Discrete Mathematics' },
  { id: 'prg', code: 'PRG', name: 'Programming' },
  { id: 'ps',  code: 'PS',  name: 'Presentation Skills' },
  { id: 'os',  code: 'OS',  name: 'Operating Systems' },
];

export const subjectById = (id) => SUBJECTS.find((s) => s.id === id);
