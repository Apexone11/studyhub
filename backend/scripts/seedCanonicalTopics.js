/**
 * seedCanonicalTopics.js — idempotent seeder for the topic catalog.
 *
 * Run as part of boot (alongside seedFeatureFlags / seedRolesV2Flags) so
 * production has the canonical roster the topic picker reads from. User-
 * created hashtags are untouched. Re-running upserts in place.
 */
const { createPrismaClient } = require('../src/lib/prisma')

const TOPICS = [
  // Computer Science
  ['computer_science', 'Computer Science', 'Computer Science'],
  ['programming', 'Programming', 'Computer Science'],
  ['data_structures', 'Data Structures', 'Computer Science'],
  ['algorithms', 'Algorithms', 'Computer Science'],
  ['web_development', 'Web Development', 'Computer Science'],
  ['mobile_development', 'Mobile Development', 'Computer Science'],
  ['machine_learning', 'Machine Learning', 'Computer Science'],
  ['artificial_intelligence', 'Artificial Intelligence', 'Computer Science'],
  ['databases', 'Databases', 'Computer Science'],
  ['cybersecurity', 'Cybersecurity', 'Computer Science'],
  ['networking', 'Networking', 'Computer Science'],
  ['operating_systems', 'Operating Systems', 'Computer Science'],
  ['cloud_computing', 'Cloud Computing', 'Computer Science'],
  ['devops', 'DevOps', 'Computer Science'],
  ['software_engineering', 'Software Engineering', 'Computer Science'],
  // Math
  ['calculus', 'Calculus', 'Math'],
  ['linear_algebra', 'Linear Algebra', 'Math'],
  ['statistics', 'Statistics', 'Math'],
  ['probability', 'Probability', 'Math'],
  ['discrete_math', 'Discrete Math', 'Math'],
  ['differential_equations', 'Differential Equations', 'Math'],
  ['geometry', 'Geometry', 'Math'],
  ['number_theory', 'Number Theory', 'Math'],
  ['algebra', 'Algebra', 'Math'],
  ['real_analysis', 'Real Analysis', 'Math'],
  // Biology
  ['biology', 'Biology', 'Biology'],
  ['anatomy', 'Anatomy', 'Biology'],
  ['physiology', 'Physiology', 'Biology'],
  ['genetics', 'Genetics', 'Biology'],
  ['ecology', 'Ecology', 'Biology'],
  ['microbiology', 'Microbiology', 'Biology'],
  ['molecular_biology', 'Molecular Biology', 'Biology'],
  ['biochemistry', 'Biochemistry', 'Biology'],
  ['neuroscience', 'Neuroscience', 'Biology'],
  // Chemistry
  ['chemistry', 'Chemistry', 'Chemistry'],
  ['organic_chemistry', 'Organic Chemistry', 'Chemistry'],
  ['inorganic_chemistry', 'Inorganic Chemistry', 'Chemistry'],
  ['physical_chemistry', 'Physical Chemistry', 'Chemistry'],
  ['analytical_chemistry', 'Analytical Chemistry', 'Chemistry'],
  // Physics
  ['physics', 'Physics', 'Physics'],
  ['mechanics', 'Mechanics', 'Physics'],
  ['electromagnetism', 'Electromagnetism', 'Physics'],
  ['thermodynamics', 'Thermodynamics', 'Physics'],
  ['quantum_mechanics', 'Quantum Mechanics', 'Physics'],
  ['relativity', 'Relativity', 'Physics'],
  ['astronomy', 'Astronomy', 'Physics'],
  // Engineering
  ['mechanical_engineering', 'Mechanical Engineering', 'Engineering'],
  ['electrical_engineering', 'Electrical Engineering', 'Engineering'],
  ['civil_engineering', 'Civil Engineering', 'Engineering'],
  ['chemical_engineering', 'Chemical Engineering', 'Engineering'],
  ['aerospace_engineering', 'Aerospace Engineering', 'Engineering'],
  ['biomedical_engineering', 'Biomedical Engineering', 'Engineering'],
  ['robotics', 'Robotics', 'Engineering'],
  ['materials_science', 'Materials Science', 'Engineering'],
  // Business
  ['business', 'Business', 'Business'],
  ['accounting', 'Accounting', 'Business'],
  ['finance', 'Finance', 'Business'],
  ['marketing', 'Marketing', 'Business'],
  ['economics', 'Economics', 'Business'],
  ['microeconomics', 'Microeconomics', 'Business'],
  ['macroeconomics', 'Macroeconomics', 'Business'],
  ['management', 'Management', 'Business'],
  ['entrepreneurship', 'Entrepreneurship', 'Business'],
  ['supply_chain', 'Supply Chain', 'Business'],
  // Humanities
  ['history', 'History', 'Humanities'],
  ['world_history', 'World History', 'Humanities'],
  ['us_history', 'US History', 'Humanities'],
  ['european_history', 'European History', 'Humanities'],
  ['philosophy', 'Philosophy', 'Humanities'],
  ['ethics', 'Ethics', 'Humanities'],
  ['logic', 'Logic', 'Humanities'],
  ['religion', 'Religion', 'Humanities'],
  // Literature & Languages
  ['literature', 'Literature', 'Languages & Literature'],
  ['english', 'English', 'Languages & Literature'],
  ['creative_writing', 'Creative Writing', 'Languages & Literature'],
  ['spanish', 'Spanish', 'Languages & Literature'],
  ['french', 'French', 'Languages & Literature'],
  ['german', 'German', 'Languages & Literature'],
  ['mandarin', 'Mandarin', 'Languages & Literature'],
  ['japanese', 'Japanese', 'Languages & Literature'],
  ['arabic', 'Arabic', 'Languages & Literature'],
  ['linguistics', 'Linguistics', 'Languages & Literature'],
  // Social Sciences
  ['psychology', 'Psychology', 'Social Sciences'],
  ['cognitive_psychology', 'Cognitive Psychology', 'Social Sciences'],
  ['developmental_psychology', 'Developmental Psychology', 'Social Sciences'],
  ['sociology', 'Sociology', 'Social Sciences'],
  ['anthropology', 'Anthropology', 'Social Sciences'],
  ['political_science', 'Political Science', 'Social Sciences'],
  ['international_relations', 'International Relations', 'Social Sciences'],
  // Health
  ['nursing', 'Nursing', 'Health'],
  ['medicine', 'Medicine', 'Health'],
  ['public_health', 'Public Health', 'Health'],
  ['nutrition', 'Nutrition', 'Health'],
  ['pharmacology', 'Pharmacology', 'Health'],
  // Law
  ['law', 'Law', 'Law'],
  ['constitutional_law', 'Constitutional Law', 'Law'],
  ['criminal_law', 'Criminal Law', 'Law'],
  ['contract_law', 'Contract Law', 'Law'],
  // Arts
  ['music', 'Music', 'Arts'],
  ['art_history', 'Art History', 'Arts'],
  ['design', 'Design', 'Arts'],
  ['film_studies', 'Film Studies', 'Arts'],
  ['photography', 'Photography', 'Arts'],
  // Test prep / general
  ['sat_prep', 'SAT Prep', 'Test Prep'],
  ['act_prep', 'ACT Prep', 'Test Prep'],
  ['gre_prep', 'GRE Prep', 'Test Prep'],
  ['mcat_prep', 'MCAT Prep', 'Test Prep'],
  ['lsat_prep', 'LSAT Prep', 'Test Prep'],
  ['study_skills', 'Study Skills', 'General'],
  ['note_taking', 'Note Taking', 'General'],
  ['time_management', 'Time Management', 'General'],
  ['exam_prep', 'Exam Prep', 'General'],
]

async function seedCanonicalTopics(prisma) {
  const results = []
  for (const [name, displayName, category] of TOPICS) {
    const upserted = await prisma.hashtag.upsert({
      where: { name },
      create: { name, displayName, category, isCanonical: true },
      update: { displayName, category, isCanonical: true },
      select: { id: true, name: true },
    })
    results.push(upserted)
  }
  return results
}

if (require.main === module) {
  ;(async () => {
    const prisma = createPrismaClient()
    try {
      const seeded = await seedCanonicalTopics(prisma)
      console.log(`[seedCanonicalTopics] upserted ${seeded.length} canonical topics`)
    } finally {
      await prisma.$disconnect()
    }
  })()
}

module.exports = { seedCanonicalTopics, TOPICS }
