// Courses for other public schools (SMCM, USNA) and private institutions

const COURSES_PRIVATE = {
  // ST. MARY'S COLLEGE OF MARYLAND (10 courses)
  SMCM: [
    { name: 'Introduction to Computer Science', code: 'CS100', department: 'Computer Science' },
    { name: 'Programming I', code: 'CS150', department: 'Computer Science' },
    { name: 'Calculus I', code: 'MATH151', department: 'Mathematics' },
    { name: 'Physics I', code: 'PHYS151', department: 'Physics' },
    { name: 'Chemistry I', code: 'CHEM151', department: 'Chemistry' },
    { name: 'Biology I', code: 'BIOL151', department: 'Biology' },
    { name: 'Composition and Literature', code: 'ENGL101', department: 'English' },
    { name: 'World History I', code: 'HIST101', department: 'History' },
    { name: 'Introduction to Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Principles of Economics', code: 'ECON101', department: 'Economics' },
  ],

  // UNITED STATES NAVAL ACADEMY (10 courses)
  USNA: [
    { name: 'Calculus I', code: 'SM101', department: 'Mathematics' },
    { name: 'Calculus II', code: 'SM102', department: 'Mathematics' },
    { name: 'Physics I', code: 'PH101', department: 'Physics' },
    { name: 'Physics II', code: 'PH102', department: 'Physics' },
    { name: 'Chemistry I', code: 'CH101', department: 'Chemistry' },
    { name: 'Engineering Graphics', code: 'EN101', department: 'Engineering' },
    { name: 'Naval Engineering', code: 'EN201', department: 'Engineering' },
    { name: 'English Composition', code: 'EN100', department: 'English' },
    { name: 'American History', code: 'HI101', department: 'History' },
    { name: 'Seamanship', code: 'NP101', department: 'Naval Procedures' },
  ],

  // LOYOLA UNIVERSITY MARYLAND (17 courses)
  Loyola: [
    { name: 'Introduction to Computer Science', code: 'CSCI101', department: 'Computer Science' },
    { name: 'Programming I', code: 'CSCI110', department: 'Computer Science' },
    { name: 'Programming II', code: 'CSCI111', department: 'Computer Science' },
    { name: 'Data Structures', code: 'CSCI210', department: 'Computer Science' },
    { name: 'Calculus I', code: 'MATH131', department: 'Mathematics' },
    { name: 'Calculus II', code: 'MATH132', department: 'Mathematics' },
    { name: 'Physics I', code: 'PHYS150', department: 'Physics' },
    { name: 'Chemistry I', code: 'CHEM101', department: 'Chemistry' },
    { name: 'Biology I', code: 'BIOL101', department: 'Biology' },
    { name: 'English Composition', code: 'ENGL101', department: 'English' },
    { name: 'Literature and Society', code: 'ENGL201', department: 'English' },
    { name: 'American History', code: 'HIST101', department: 'History' },
    { name: 'World Religions', code: 'THOL101', department: 'Theology' },
    { name: 'Introduction to Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Microeconomics', code: 'ECON201', department: 'Economics' },
    { name: 'Business Law I', code: 'BUSN301', department: 'Business' },
    { name: 'Accounting Principles', code: 'ACCT301', department: 'Accounting' },
  ],

  // MCDANIEL COLLEGE (13 courses)
  McDaniel: [
    { name: 'Introduction to Computer Science', code: 'CS105', department: 'Computer Science' },
    { name: 'Data Structures', code: 'CS205', department: 'Computer Science' },
    { name: 'Calculus I', code: 'MATH131', department: 'Mathematics' },
    { name: 'Physics I', code: 'PHYS151', department: 'Physics' },
    { name: 'Chemistry I', code: 'CHEM151', department: 'Chemistry' },
    { name: 'Biology I', code: 'BIOL151', department: 'Biology' },
    { name: 'Composition and Rhetoric', code: 'ENGL101', department: 'English' },
    { name: 'Literature and Culture', code: 'ENGL201', department: 'English' },
    { name: 'U.S. History I', code: 'HIST151', department: 'History' },
    { name: 'World History I', code: 'HIST101', department: 'History' },
    { name: 'Psychology of Learning', code: 'PSYC201', department: 'Psychology' },
    { name: 'Principles of Economics', code: 'ECON101', department: 'Economics' },
    { name: 'Business Administration', code: 'BUSN101', department: 'Business' },
  ],

  // HOOD COLLEGE (12 courses)
  Hood: [
    { name: 'Introduction to Computer Science', code: 'CS110', department: 'Computer Science' },
    { name: 'Programming I', code: 'CS150', department: 'Computer Science' },
    { name: 'Calculus I', code: 'MATH131', department: 'Mathematics' },
    { name: 'Physics I', code: 'PHYS151', department: 'Physics' },
    { name: 'Chemistry I', code: 'CHEM151', department: 'Chemistry' },
    { name: 'Biology I', code: 'BIOL151', department: 'Biology' },
    { name: 'English Composition', code: 'ENGL101', department: 'English' },
    { name: 'American History', code: 'HIST101', department: 'History' },
    { name: 'Introduction to Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Economics Principles', code: 'ECON101', department: 'Economics' },
    { name: 'Business Foundations', code: 'BUSN101', department: 'Business' },
    { name: 'Studio Art I', code: 'ART101', department: 'Art' },
  ],

  // GOUCHER COLLEGE (13 courses)
  Goucher: [
    { name: 'Introduction to Computer Science', code: 'CS105', department: 'Computer Science' },
    { name: 'Programming I', code: 'CS150', department: 'Computer Science' },
    { name: 'Calculus I', code: 'MATH131', department: 'Mathematics' },
    { name: 'Physics I', code: 'PHYS151', department: 'Physics' },
    { name: 'Chemistry I', code: 'CHEM151', department: 'Chemistry' },
    { name: 'Biology I', code: 'BIOL151', department: 'Biology' },
    { name: 'English Composition', code: 'ENGL100', department: 'English' },
    { name: 'Literature Seminar', code: 'ENGL200', department: 'English' },
    { name: 'American History', code: 'HIST150', department: 'History' },
    { name: 'World History', code: 'HIST100', department: 'History' },
    { name: 'Introduction to Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Microeconomics', code: 'ECON101', department: 'Economics' },
    { name: 'Contemporary Issues', code: 'POLS101', department: 'Political Science' },
  ],

  // MOUNT ST. MARY'S UNIVERSITY (11 courses)
  MSM: [
    { name: 'Introduction to CS', code: 'CSCI110', department: 'Computer Science' },
    { name: 'Programming I', code: 'CSCI150', department: 'Computer Science' },
    { name: 'Calculus I', code: 'MATH131', department: 'Mathematics' },
    { name: 'Physics I', code: 'PHYS151', department: 'Physics' },
    { name: 'Chemistry I', code: 'CHEM151', department: 'Chemistry' },
    { name: 'Biology I', code: 'BIOL151', department: 'Biology' },
    { name: 'Composition I', code: 'ENGL101', department: 'English' },
    { name: 'World History', code: 'HIST101', department: 'History' },
    { name: 'Christian Theology', code: 'THEL101', department: 'Theology' },
    { name: 'Psychology I', code: 'PSYC101', department: 'Psychology' },
    { name: 'Economics I', code: 'ECON101', department: 'Economics' },
  ],

  // WASHINGTON COLLEGE (12 courses)
  WashCol: [
    { name: 'Introduction to Computer Science', code: 'CS105', department: 'Computer Science' },
    { name: 'Programming Fundamentals', code: 'CS110', department: 'Computer Science' },
    { name: 'Calculus I', code: 'MATH131', department: 'Mathematics' },
    { name: 'Physics I', code: 'PHYS151', department: 'Physics' },
    { name: 'Chemistry I', code: 'CHEM151', department: 'Chemistry' },
    { name: 'Biology I', code: 'BIOL151', department: 'Biology' },
    { name: 'English Composition', code: 'ENGL101', department: 'English' },
    { name: 'American Literature', code: 'ENGL250', department: 'English' },
    { name: 'U.S. History I', code: 'HIST151', department: 'History' },
    { name: 'Introduction to Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Economics Principles', code: 'ECON101', department: 'Economics' },
    { name: 'Environmental Studies', code: 'ENVS101', department: 'Environmental Science' },
  ],

  // STEVENSON UNIVERSITY (13 courses)
  Stevenson: [
    { name: 'Introduction to Computer Science', code: 'CS110', department: 'Computer Science' },
    { name: 'Programming I', code: 'CS150', department: 'Computer Science' },
    { name: 'Data Structures', code: 'CS250', department: 'Computer Science' },
    { name: 'Calculus I', code: 'MATH131', department: 'Mathematics' },
    { name: 'Physics I', code: 'PHYS150', department: 'Physics' },
    { name: 'Chemistry I', code: 'CHEM151', department: 'Chemistry' },
    { name: 'Biology I', code: 'BIOL151', department: 'Biology' },
    { name: 'Writing and Rhetoric', code: 'ENGL101', department: 'English' },
    { name: 'American History', code: 'HIST151', department: 'History' },
    { name: 'World History', code: 'HIST101', department: 'History' },
    { name: 'Introduction to Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Business Fundamentals', code: 'BUSN101', department: 'Business' },
    { name: 'Marketing Essentials', code: 'MKTG201', department: 'Marketing' },
  ],

  // NOTRE DAME OF MARYLAND UNIVERSITY (13 courses)
  NDMU: [
    { name: 'Introduction to Computer Science', code: 'CS105', department: 'Computer Science' },
    { name: 'Programming I', code: 'CS150', department: 'Computer Science' },
    { name: 'Calculus I', code: 'MATH131', department: 'Mathematics' },
    { name: 'Physics I', code: 'PHYS150', department: 'Physics' },
    { name: 'Chemistry I', code: 'CHEM150', department: 'Chemistry' },
    { name: 'Biology I', code: 'BIOL150', department: 'Biology' },
    { name: 'English Composition', code: 'ENGL101', department: 'English' },
    { name: 'Women and Literature', code: 'ENGL250', department: 'English' },
    { name: 'World History', code: 'HIST101', department: 'History' },
    { name: 'Christian Ethics', code: 'THOL201', department: 'Theology' },
    { name: 'Introduction to Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Nursing Fundamentals', code: 'NURS101', department: 'Nursing' },
    { name: 'Health Care Ethics', code: 'NURS200', department: 'Nursing' },
  ],
}

module.exports = { COURSES_PRIVATE }
