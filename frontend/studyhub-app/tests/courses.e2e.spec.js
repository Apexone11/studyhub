import { test, expect } from '@playwright/test'
import { mockAuthenticatedApp, createSessionUser } from './helpers/mockStudyHubApi'

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('studyhub.upload.tutorial.v1', '1')
  })
}

test.describe('My Courses Page', () => {
  test.beforeEach(async ({ page }) => {
    await disableTutorials(page)
  })

  test('courses page loads with school selection', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-courses-1',
      email: 'courseuser@university.edu',
      username: 'courseuser',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      await page.route('**/api/schools', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            schools: [
              {
                id: 'school-1',
                name: 'State University',
                short: 'SU',
              },
              {
                id: 'school-2',
                name: 'Central College',
                short: 'CC',
              },
            ],
          }),
        })
      })

      await page.route('**/api/settings/courses', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enrolledCourses: [],
          }),
        })
      })

      await page.goto('/my-courses')

      // Verify page heading
      const heading = page.locator('text=/Choose Your School|My Courses/i')
      await expect(heading).toBeVisible()

      // Verify school selection section is visible
      const schoolSection = page.locator('[data-testid="school-selection"]')
      await expect(schoolSection).toBeVisible()
    })
  })

  test('can search for schools', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-courses-2',
      email: 'searchcourse@university.edu',
      username: 'searchcourse',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      let searchCalled = false

      await page.route('**/api/schools*', (route) => {
        const url = new URL(route.request().url())
        const searchParam = url.searchParams.get('search')

        if (searchParam === 'central') {
          searchCalled = true
          route.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              schools: [
                {
                  id: 'school-2',
                  name: 'Central College',
                  short: 'CC',
                },
              ],
            }),
          })
        } else if (!searchParam) {
          route.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              schools: [
                {
                  id: 'school-1',
                  name: 'State University',
                  short: 'SU',
                },
                {
                  id: 'school-2',
                  name: 'Central College',
                  short: 'CC',
                },
              ],
            }),
          })
        } else {
          route.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              schools: [],
            }),
          })
        }
      })

      await page.route('**/api/settings/courses', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enrolledCourses: [],
          }),
        })
      })

      await page.goto('/my-courses')

      // Find school search input
      const schoolSearch = page.locator('[data-testid="school-search"]')
      await expect(schoolSearch).toBeVisible()

      // Type in search
      await schoolSearch.fill('central')

      // Wait for results
      await page.waitForLoadState('networkidle')

      // Verify filtered results are visible
      const centralCollege = page.locator('text=Central College')
      await expect(centralCollege).toBeVisible()

      // Verify search was called
      expect(searchCalled).toBe(true)
    })
  })

  test('shows courses after school selection', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-courses-3',
      email: 'coursesafter@university.edu',
      username: 'coursesafter',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      let coursesCalled = false

      await page.route('**/api/schools', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            schools: [
              {
                id: 'school-1',
                name: 'State University',
                short: 'SU',
              },
            ],
          }),
        })
      })

      await page.route('**/api/schools/school-1/courses', (route) => {
        coursesCalled = true
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            courses: [
              {
                id: 'course-1',
                code: 'BIO101',
                name: 'Introduction to Biology',
                department: 'Life Sciences',
              },
              {
                id: 'course-2',
                code: 'BIO201',
                name: 'Advanced Biology',
                department: 'Life Sciences',
              },
              {
                id: 'course-3',
                code: 'CHEM101',
                name: 'General Chemistry',
                department: 'Chemistry',
              },
            ],
          }),
        })
      })

      await page.route('**/api/settings/courses', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enrolledCourses: [],
          }),
        })
      })

      await page.goto('/my-courses')

      // Click on school selection
      const schoolOption = page.locator('text=State University')
      await schoolOption.click()

      // Wait for courses to load
      await page.waitForLoadState('networkidle')

      // Verify courses section appears
      const coursesSection = page.locator('[data-testid="courses-selection"]')
      await expect(coursesSection).toBeVisible()

      // Verify first course appears
      const firstCourse = page.locator('text=Introduction to Biology')
      await expect(firstCourse).toBeVisible()

      // Verify second course appears
      const secondCourse = page.locator('text=Advanced Biology')
      await expect(secondCourse).toBeVisible()

      // Verify third course appears
      const thirdCourse = page.locator('text=General Chemistry')
      await expect(thirdCourse).toBeVisible()

      // Verify courses API was called
      expect(coursesCalled).toBe(true)
    })
  })

  test('can select and save courses', async ({ page }) => {
    const mockUser = createSessionUser({
      id: 'user-courses-4',
      email: 'savecourses@university.edu',
      username: 'savecourses',
    })

    await mockAuthenticatedApp(page, mockUser, async () => {
      let saveCalled = false
      let savedCourseIds = []

      await page.route('**/api/schools', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            schools: [
              {
                id: 'school-1',
                name: 'State University',
                short: 'SU',
              },
            ],
          }),
        })
      })

      await page.route('**/api/schools/school-1/courses', (route) => {
        route.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            courses: [
              {
                id: 'course-1',
                code: 'BIO101',
                name: 'Introduction to Biology',
                department: 'Life Sciences',
              },
              {
                id: 'course-2',
                code: 'CHEM101',
                name: 'General Chemistry',
                department: 'Chemistry',
              },
            ],
          }),
        })
      })

      await page.route('**/api/settings/courses', (route) => {
        if (route.request().method() === 'PATCH') {
          saveCalled = true
          const body = route.request().postDataJSON()
          savedCourseIds = body.courseIds || []
          route.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              enrolledCourses: savedCourseIds,
            }),
          })
        } else {
          route.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              enrolledCourses: [],
            }),
          })
        }
      })

      await page.goto('/my-courses')

      // Click on school
      const schoolOption = page.locator('text=State University')
      await schoolOption.click()

      // Wait for courses to load
      await page.waitForLoadState('networkidle')

      // Select first course checkbox
      const firstCourseCheckbox = page.locator('[data-testid="course-checkbox-course-1"]')
      await firstCourseCheckbox.check()

      // Select second course checkbox
      const secondCourseCheckbox = page.locator('[data-testid="course-checkbox-course-2"]')
      await secondCourseCheckbox.check()

      // Verify save button is visible
      const saveButton = page.locator('[data-testid="save-courses-button"]')
      await expect(saveButton).toBeVisible()

      // Click save
      await saveButton.click()

      // Wait for save to complete
      await page.waitForLoadState('networkidle')

      // Verify save was called
      expect(saveCalled).toBe(true)

      // Verify correct courses were saved
      expect(savedCourseIds).toContain('course-1')
      expect(savedCourseIds).toContain('course-2')
    })
  })

  test('redirects to login when unauthenticated', async ({ page }) => {
    // Don't mock authenticated app - test redirect for unauthenticated user
    await disableTutorials(page)

    // Mock the session check to return unauthenticated
    await page.route('**/api/auth/me', (route) => {
      route.abort('blockedbyclient')
    })

    await page.goto('/my-courses')

    // Wait for redirect
    await page.waitForURL('/login')

    // Verify we're on login page
    await expect(page).toHaveURL(/\/login/)
  })
})
