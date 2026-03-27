// Courses for community colleges and the DEFAULT fallback

const COURSES_COMMUNITY = {
  // MONTGOMERY COLLEGE - Community College (14 courses)
  MC: [
    { name: 'Programming Fundamentals I', code: 'CMSC110', department: 'Computer Science' },
    { name: 'Programming Fundamentals II', code: 'CMSC111', department: 'Computer Science' },
    { name: 'Web Development', code: 'CMSC130', department: 'Computer Science' },
    { name: 'College Algebra', code: 'MATH120', department: 'Mathematics' },
    { name: 'Calculus I', code: 'MATH161', department: 'Mathematics' },
    { name: 'General Biology I', code: 'BIOL101', department: 'Biology' },
    { name: 'General Chemistry I', code: 'CHEM101', department: 'Chemistry' },
    { name: 'Physics I', code: 'PHYS141', department: 'Physics' },
    { name: 'English Composition I', code: 'ENGL101', department: 'English' },
    { name: 'American History I', code: 'HIST141', department: 'History' },
    { name: 'Introduction to Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Microeconomics', code: 'ECON201', department: 'Economics' },
    { name: 'Introduction to Business', code: 'BUSN105', department: 'Business' },
    { name: 'Accounting Principles', code: 'ACCT101', department: 'Accounting' },
  ],

  // PRINCE GEORGE'S COMMUNITY COLLEGE (13 courses)
  PGCC: [
    { name: 'Introduction to Programming', code: 'COIT100', department: 'Computer Science' },
    { name: 'Programming I', code: 'COIT110', department: 'Computer Science' },
    { name: 'Programming II', code: 'COIT111', department: 'Computer Science' },
    { name: 'College Algebra', code: 'MATH110', department: 'Mathematics' },
    { name: 'Calculus I', code: 'MATH160', department: 'Mathematics' },
    { name: 'Biology I', code: 'BIOL101', department: 'Biology' },
    { name: 'Chemistry I', code: 'CHEM101', department: 'Chemistry' },
    { name: 'Physics I', code: 'PHYS140', department: 'Physics' },
    { name: 'English Composition I', code: 'ENGL101', department: 'English' },
    { name: 'World History I', code: 'HIST151', department: 'History' },
    { name: 'Introduction to Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Macroeconomics', code: 'ECON202', department: 'Economics' },
    { name: 'Business Management', code: 'BUSN101', department: 'Business' },
  ],

  // COMMUNITY COLLEGE OF BALTIMORE COUNTY (14 courses)
  CCBC: [
    { name: 'Introduction to Computing', code: 'COMP110', department: 'Computer Science' },
    { name: 'Programming Concepts', code: 'COMP130', department: 'Computer Science' },
    { name: 'Web Development Fundamentals', code: 'COMP140', department: 'Computer Science' },
    { name: 'Intermediate Algebra', code: 'MATH070', department: 'Mathematics' },
    { name: 'College Algebra', code: 'MATH115', department: 'Mathematics' },
    { name: 'Calculus I', code: 'MATH160', department: 'Mathematics' },
    { name: 'General Biology I', code: 'BIOL101', department: 'Biology' },
    { name: 'General Chemistry I', code: 'CHEM101', department: 'Chemistry' },
    { name: 'Physics I', code: 'PHYS140', department: 'Physics' },
    { name: 'English Composition I', code: 'ENGL101', department: 'English' },
    { name: 'American History I', code: 'HIST101', department: 'History' },
    { name: 'Introduction to Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Business Math', code: 'MATH140', department: 'Mathematics' },
    { name: 'Accounting Fundamentals', code: 'ACCT101', department: 'Accounting' },
  ],

  // ANNE ARUNDEL COMMUNITY COLLEGE (13 courses)
  AACC: [
    { name: 'Computer Concepts I', code: 'CSCI110', department: 'Computer Science' },
    { name: 'Programming I', code: 'CSCI120', department: 'Computer Science' },
    { name: 'Programming II', code: 'CSCI121', department: 'Computer Science' },
    { name: 'College Algebra', code: 'MATH100', department: 'Mathematics' },
    { name: 'Precalculus', code: 'MATH130', department: 'Mathematics' },
    { name: 'Calculus I', code: 'MATH150', department: 'Mathematics' },
    { name: 'Biology I', code: 'BIOL101', department: 'Biology' },
    { name: 'Chemistry I', code: 'CHEM101', department: 'Chemistry' },
    { name: 'Physics for Life Science', code: 'PHYS110', department: 'Physics' },
    { name: 'English Composition I', code: 'ENGL101', department: 'English' },
    { name: 'U.S. History to 1865', code: 'HIST101', department: 'History' },
    { name: 'Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Business Law', code: 'BUSN140', department: 'Business' },
  ],

  // HOWARD COMMUNITY COLLEGE (13 courses)
  HCC: [
    { name: 'Introduction to Programming', code: 'CIST100', department: 'Computer Science' },
    { name: 'Programming Fundamentals I', code: 'CIST110', department: 'Computer Science' },
    { name: 'Web Design I', code: 'CIST140', department: 'Computer Science' },
    { name: 'College Algebra', code: 'MATH090', department: 'Mathematics' },
    { name: 'Precalculus', code: 'MATH120', department: 'Mathematics' },
    { name: 'Calculus I', code: 'MATH131', department: 'Mathematics' },
    { name: 'General Biology I', code: 'BIOL101', department: 'Biology' },
    { name: 'General Chemistry I', code: 'CHEM101', department: 'Chemistry' },
    { name: 'Physics I', code: 'PHYS161', department: 'Physics' },
    { name: 'Composition I', code: 'ENGL101', department: 'English' },
    { name: 'American History I', code: 'HIST121', department: 'History' },
    { name: 'Intro to Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Accounting Principles', code: 'ACCT101', department: 'Accounting' },
  ],

  // FREDERICK COMMUNITY COLLEGE (13 courses)
  FCC: [
    { name: 'Introduction to Computers', code: 'COMP100', department: 'Computer Science' },
    { name: 'Programming I', code: 'CSIS110', department: 'Computer Science' },
    { name: 'Internet Fundamentals', code: 'CSIS140', department: 'Computer Science' },
    { name: 'Basic Algebra', code: 'MATH050', department: 'Mathematics' },
    { name: 'College Algebra', code: 'MATH100', department: 'Mathematics' },
    { name: 'Calculus I', code: 'MATH140', department: 'Mathematics' },
    { name: 'Biology I', code: 'BIOL111', department: 'Biology' },
    { name: 'Chemistry I', code: 'CHEM111', department: 'Chemistry' },
    { name: 'Physics I', code: 'PHYS141', department: 'Physics' },
    { name: 'Writing I', code: 'ENGL101', department: 'English' },
    { name: 'American History I', code: 'HIST104', department: 'History' },
    { name: 'Psychology', code: 'PSYC101', department: 'Psychology' },
    { name: 'Intro to Business', code: 'BUSN101', department: 'Business' },
  ],

  // HARFORD COMMUNITY COLLEGE (12 courses)
  Harford: [
    { name: 'Introduction to IT', code: 'ISDM101', department: 'Information Technology' },
    { name: 'Programming I', code: 'ISDM110', department: 'Information Technology' },
    { name: 'Web Development I', code: 'ISDM120', department: 'Information Technology' },
    { name: 'College Algebra', code: 'MATH100', department: 'Mathematics' },
    { name: 'Precalculus', code: 'MATH115', department: 'Mathematics' },
    { name: 'Calculus I', code: 'MATH130', department: 'Mathematics' },
    { name: 'Biology I', code: 'BIOL101', department: 'Biology' },
    { name: 'Chemistry I', code: 'CHEM101', department: 'Chemistry' },
    { name: 'Physics I', code: 'PHYS151', department: 'Physics' },
    { name: 'English Composition', code: 'ENGL101', department: 'English' },
    { name: 'History I', code: 'HIST101', department: 'History' },
    { name: 'Intro to Psychology', code: 'PSYC101', department: 'Psychology' },
  ],

  // CARROLL COMMUNITY COLLEGE (12 courses)
  Carroll: [
    { name: 'Introduction to Programming', code: 'CS100', department: 'Computer Science' },
    { name: 'Programming I', code: 'CS110', department: 'Computer Science' },
    { name: 'Web Development', code: 'CS140', department: 'Computer Science' },
    { name: 'Intermediate Algebra', code: 'MATH050', department: 'Mathematics' },
    { name: 'College Algebra', code: 'MATH110', department: 'Mathematics' },
    { name: 'Calculus I', code: 'MATH160', department: 'Mathematics' },
    { name: 'Biology', code: 'BIOL101', department: 'Biology' },
    { name: 'Chemistry', code: 'CHEM101', department: 'Chemistry' },
    { name: 'Physics', code: 'PHYS121', department: 'Physics' },
    { name: 'Composition', code: 'ENGL101', department: 'English' },
    { name: 'American History', code: 'HIST101', department: 'History' },
    { name: 'Psychology', code: 'PSYC101', department: 'Psychology' },
  ],

  // COLLEGE OF SOUTHERN MARYLAND (12 courses)
  CSM: [
    { name: 'Intro to Computers', code: 'CSIT101', department: 'Computer Science' },
    { name: 'Programming I', code: 'CSIT110', department: 'Computer Science' },
    { name: 'Web Design Basics', code: 'CSIT140', department: 'Computer Science' },
    { name: 'Basic Math', code: 'MATH032', department: 'Mathematics' },
    { name: 'College Algebra', code: 'MATH105', department: 'Mathematics' },
    { name: 'Calculus I', code: 'MATH150', department: 'Mathematics' },
    { name: 'Biology', code: 'BIOL101', department: 'Biology' },
    { name: 'Chemistry', code: 'CHEM101', department: 'Chemistry' },
    { name: 'Physics', code: 'PHYS121', department: 'Physics' },
    { name: 'English Composition', code: 'ENGL101', department: 'English' },
    { name: 'World History', code: 'HIST101', department: 'History' },
    { name: 'Intro to Psychology', code: 'PSYC101', department: 'Psychology' },
  ],

  // DEFAULT courses for schools without specific listings
  DEFAULT: [
    { name: 'Calculus I', code: 'MATH101', department: 'Mathematics' },
    { name: 'Calculus II', code: 'MATH102', department: 'Mathematics' },
    { name: 'Intro to Computer Science', code: 'CS101', department: 'Computer Science' },
    { name: 'Data Structures', code: 'CS201', department: 'Computer Science' },
    { name: 'General Chemistry I', code: 'CHEM101', department: 'Chemistry' },
    { name: 'General Physics I', code: 'PHYS101', department: 'Physics' },
    { name: 'Intro to Biology', code: 'BIO101', department: 'Biology' },
    { name: 'Microeconomics', code: 'ECON101', department: 'Economics' },
    { name: 'Statistics', code: 'STAT101', department: 'Statistics' },
    { name: 'Technical Writing', code: 'ENG201', department: 'English' },
  ],
}

module.exports = { COURSES_COMMUNITY }
