export const MOCK_USERS = {
  STUDENT: {
    id: 'user_student_1',
    name: 'Priya',
    phone: '+91 98765 43210',
    role: 'student',
    university: 'JG University'
  },
  CR: {
    id: 'user_cr_1',
    name: 'Gautam',
    phone: '+91 12345 67890',
    role: 'admin',
    university: 'JG University'
  }
};

export const MOCK_SUBJECTS = [
  { id: 'all', code: 'All', name: 'All Subjects' },
  { id: 'dld', code: 'DLD', name: 'Digital Logic' },
  { id: 'elx', code: 'ELX', name: 'Electronics' },
  { id: 'dm', code: 'DM', name: 'Discrete Mathematics' },
  { id: 'prg', code: 'PRG', name: 'Programming' },
  { id: 'ps', code: 'PS', name: 'Probability & Statistics' },
  { id: 'os', code: 'OS', name: 'Operating Systems' }
];

export const MOCK_NOTES = [
  {
    id: 'note_1',
    subject_id: 'dld',
    chapter: 'Number Systems',
    topic: 'Number Systems',
    content: '{"ops":[{"insert":"1. Introduction\\n"},{"attributes":{"bold":true},"insert":"A number system"},{"insert":" is a way to represent numbers using a set of symbols and rules.\\n\\nCommon number systems:\\n- Decimal (Base 10)\\n- Binary (Base 2)\\n- Octal (Base 8)\\n- Hexadecimal (Base 16)\\n\\n"},{"attributes":{"bold":true},"insert":"Why different number systems?"},{"insert":"\\n- Computers use binary (0 and 1)\\n- Humans use decimal (0 - 9)\\n\\n2. Decimal to Binary Conversion\\n- Repeatedly divide by 2 and note the remainders.\\n- Read the remainders in reverse order.\\n"}]}',
    status: 'published',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    author_id: 'user_cr_1',
    comments_count: 4
  },
  {
    id: 'note_2',
    subject_id: 'prg',
    chapter: 'Introduction to C',
    topic: 'Introduction to C',
    content: '{"ops":[{"insert":"C is a procedural programming language. It was initially developed by Dennis Ritchie in the year 1972.\\n\\nMain features:\\n- Fast and efficient\\n- Portable\\n- Highly extensible\\n"}]}',
    status: 'published',
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    author_id: 'user_cr_1',
    comments_count: 2
  },
  {
    id: 'note_3',
    subject_id: 'dm',
    chapter: 'Sets and Relations',
    topic: 'Sets and Relations',
    content: '{"ops":[{"insert":"A set is a well-defined collection of distinct objects.\\n\\nTypes of sets:\\n- Empty set\\n- Finite set\\n- Infinite set\\n- Equal sets\\n"}]}',
    status: 'published',
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    author_id: 'user_cr_1',
    comments_count: 1
  },
  {
    id: 'note_4',
    subject_id: 'elx',
    chapter: 'Diodes and Applications',
    topic: 'Diodes and Applications',
    content: '{"ops":[{"insert":"A diode is a semiconductor device that essentially acts as a one-way switch for current.\\n"}]}',
    status: 'published',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    author_id: 'user_cr_1',
    comments_count: 0
  },
  {
    id: 'note_5',
    subject_id: 'os',
    chapter: 'Process Management',
    topic: 'Process Management',
    content: '{"ops":[{"insert":"A process is a program in execution.\\n"}]}',
    status: 'draft',
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    author_id: 'user_cr_1',
    comments_count: 0
  }
];

export const MOCK_COMMENTS = [
  {
    id: 'comment_1',
    note_id: 'note_1',
    author: { name: 'Rahul', role: 'student', id: 'user_student_2' },
    content: 'Sir, can someone explain this conversion?',
    created_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    replies: [
      {
        id: 'reply_1',
        author: { name: 'Priya', role: 'student', id: 'user_student_1' },
        content: 'I think we first convert the number into powers of 2, right?',
        created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString()
      },
      {
        id: 'reply_2',
        author: { name: 'Gautam', role: 'admin', id: 'user_cr_1' },
        content: 'Exactly. Keep dividing by 2 and note remainders.',
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
      }
    ]
  },
  {
    id: 'comment_2',
    note_id: 'note_1',
    author: { name: 'Amit', role: 'student', id: 'user_student_3' },
    content: 'Are we supposed to memorize the hex table?',
    created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    replies: []
  }
];

export const MOCK_ACTIVITY = [
  {
    id: 'act_1',
    type: 'reply',
    user: 'Rahul',
    action: 'replied to your comment',
    target: 'DLD — Number Systems',
    date: 'Today',
    time: new Date(Date.now() - 8 * 60 * 1000).toISOString()
  },
  {
    id: 'act_2',
    type: 'comment',
    user: 'Priya',
    action: 'commented on:',
    target: 'Programming — Functions',
    date: 'Today',
    time: new Date(Date.now() - 60 * 60 * 1000).toISOString()
  },
  {
    id: 'act_3',
    type: 'publish',
    user: 'Gautam',
    action: 'New note published:',
    target: 'Digital Logic — Boolean Algebra',
    date: 'Yesterday',
    time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  }
];
