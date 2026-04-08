/**
 * seed-content.js
 *
 * Enriches the database with realistic study sheets across UMD's most
 * popular courses. Run AFTER the primary seed script (seed.js).
 *
 * Usage:
 *   node prisma/seed-content.js
 *
 * This script is additive — it skips sheets whose title already exists
 * for a given course to avoid duplicates on re-runs.
 */
const path = require('node:path')
const bcrypt = require('bcryptjs')
const { createPrismaClient } = require('../src/lib/prisma')
const { assertLocalDatabase } = require('../scripts/assertLocalDatabase')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

assertLocalDatabase('content seed script')

const prisma = createPrismaClient()

/* ─── Seed authors ────────────────────────────────────────────────── */

const AUTHORS = [
  { username: 'terp_cs_tutor', role: 'student' },
  { username: 'math_maven', role: 'student' },
  { username: 'bio_nerd_umd', role: 'student' },
  { username: 'chem_whiz', role: 'student' },
  { username: 'prof_notes_daily', role: 'student' },
]

/* ─── Study sheet content by course code ──────────────────────────── */

const SEED_SHEETS = {
  CMSC131: [
    {
      title: 'CMSC131 Final Exam Review — Complete',
      description: 'Everything you need for the 131 final: OOP, arrays, recursion, and common exam patterns.',
      content: `# CMSC131 Final Exam Review

## 1. Object-Oriented Programming Fundamentals

### Classes vs Objects
A **class** is a blueprint that defines the structure and behavior of objects. An **object** is a specific instance created from that blueprint.

\`\`\`java
public class Student {
    private String name;
    private int credits;

    public Student(String name) {
        this.name = name;
        this.credits = 0;
    }

    public void addCredits(int n) {
        this.credits += n;
    }

    public String toString() {
        return name + " (" + credits + " credits)";
    }
}
\`\`\`

### The Four Pillars
1. **Encapsulation** — Hide internal state behind methods. Use \`private\` fields + \`public\` getters/setters.
2. **Abstraction** — Expose only what matters. Abstract classes and interfaces hide implementation details.
3. **Inheritance** — \`extends\` lets a subclass reuse and override parent behavior.
4. **Polymorphism** — One interface, many implementations. A \`Shape\` reference can point to a \`Circle\` or \`Rectangle\`.

## 2. Arrays and ArrayLists

### Array Basics
\`\`\`java
int[] scores = new int[10];          // fixed-size, default 0
String[] names = {"Alice", "Bob"};   // literal initialization
\`\`\`

### Common Patterns
- **Linear search**: O(n) — scan left to right.
- **Finding max/min**: Track a running best.
- **Copying**: \`Arrays.copyOf(arr, arr.length)\` — deep copy for primitives, shallow for objects.

### ArrayList vs Array
| Feature | Array | ArrayList |
|---------|-------|-----------|
| Size | Fixed | Dynamic |
| Primitives | Yes | No (use wrappers) |
| Methods | \`.length\` | \`.size()\`, \`.add()\`, \`.remove()\` |

## 3. Recursion

### Template
\`\`\`java
public static int factorial(int n) {
    if (n <= 1) return 1;            // base case
    return n * factorial(n - 1);     // recursive case
}
\`\`\`

### Key Insight
Every recursive call must move **closer** to the base case. If it doesn't, you get a \`StackOverflowError\`.

### Common Recursive Problems (Exam Favorites)
- Fibonacci
- Binary search
- Palindrome check
- Tower of Hanoi
- String reversal

## 4. Exam Tips

- **Read the full question** before writing code. Circle the return type.
- **Trace through examples** on paper. The exam rewards methodical work.
- **Edge cases**: empty arrays, null references, single-element inputs.
- **Time management**: Skip a question if stuck for > 8 minutes. Come back later.`,
      stars: 47,
      downloads: 134,
      author: 'terp_cs_tutor',
    },
    {
      title: 'Java String Methods Quick Reference',
      description: 'One-page reference for every String method that shows up on 131 exams.',
      content: `# Java String Methods — CMSC131 Quick Reference

## Creating Strings
\`\`\`java
String s1 = "hello";                    // string literal (interned)
String s2 = new String("hello");        // new object on heap
String s3 = String.valueOf(42);         // "42"
\`\`\`

## Comparison (THIS ALWAYS SHOWS UP ON EXAMS)
\`\`\`java
s1 == s2           // false! Compares references
s1.equals(s2)      // true — compares content
s1.equalsIgnoreCase("HELLO")  // true
s1.compareTo("world")         // negative (h < w)
\`\`\`

## Searching
| Method | Returns | Example |
|--------|---------|---------|
| \`charAt(i)\` | char | \`"hello".charAt(1)\` → \`'e'\` |
| \`indexOf(str)\` | int (-1 if missing) | \`"hello".indexOf("ll")\` → \`2\` |
| \`contains(str)\` | boolean | \`"hello".contains("ell")\` → \`true\` |
| \`startsWith(str)\` | boolean | \`"hello".startsWith("he")\` → \`true\` |
| \`endsWith(str)\` | boolean | \`"hello".endsWith("lo")\` → \`true\` |

## Extracting
| Method | Returns | Example |
|--------|---------|---------|
| \`substring(start)\` | String | \`"hello".substring(2)\` → \`"llo"\` |
| \`substring(start, end)\` | String | \`"hello".substring(1, 3)\` → \`"el"\` |
| \`toCharArray()\` | char[] | For iteration |

## Transforming
\`\`\`java
"Hello".toLowerCase()          // "hello"
"Hello".toUpperCase()          // "HELLO"
"  hi  ".trim()                // "hi"
"hello".replace('l', 'r')     // "herro"
\`\`\`

## Important: Strings Are Immutable
Every method returns a **new** String. The original is unchanged.
\`\`\`java
String s = "hello";
s.toUpperCase();     // returns "HELLO" but s is still "hello"
s = s.toUpperCase(); // NOW s is "HELLO"
\`\`\``,
      stars: 33,
      downloads: 98,
      author: 'terp_cs_tutor',
    },
  ],

  CMSC132: [
    {
      title: 'CMSC132 Data Structures Cheat Sheet',
      description: 'Big-O complexities and implementation notes for every data structure covered in 132.',
      content: `# CMSC132 Data Structures — Cheat Sheet

## Time Complexity Summary

| Structure | Access | Search | Insert | Delete | Notes |
|-----------|--------|--------|--------|--------|-------|
| Array | O(1) | O(n) | O(n) | O(n) | Fast access, slow insert |
| LinkedList | O(n) | O(n) | O(1)* | O(1)* | *At known position |
| Stack | O(n) | O(n) | O(1) | O(1) | LIFO — push/pop |
| Queue | O(n) | O(n) | O(1) | O(1) | FIFO — enqueue/dequeue |
| HashMap | — | O(1)† | O(1)† | O(1)† | †Amortized, O(n) worst |
| TreeMap | — | O(log n) | O(log n) | O(log n) | Sorted keys |
| Heap | — | O(n) | O(log n) | O(log n) | Priority queue |
| BST | — | O(log n)‡ | O(log n)‡ | O(log n)‡ | ‡Balanced only |

## Linked Lists

### Singly Linked List
\`\`\`java
class Node<T> {
    T data;
    Node<T> next;
}
\`\`\`

**Key operations:**
- Insert at head: O(1) — new node points to old head
- Insert at tail: O(n) without tail pointer, O(1) with
- Delete by value: O(n) — must find predecessor

### Doubly Linked List
Same but with \`prev\` pointer. Enables O(1) delete if you have the node reference.

## Hash Maps

### How Hashing Works
1. Compute \`key.hashCode()\`
2. Map to bucket: \`index = hash % table.length\`
3. Handle collisions: chaining (linked list) or open addressing

### Load Factor
\`loadFactor = entries / buckets\`. Java's HashMap resizes at 0.75.

## Binary Search Trees

### BST Property
For every node: left subtree values < node < right subtree values.

### Traversals (KNOW THESE COLD)
- **In-order** (L, Root, R): Gives sorted output
- **Pre-order** (Root, L, R): Good for copying/serializing
- **Post-order** (L, R, Root): Good for deletion
- **Level-order**: BFS with a queue

## Graphs

### Representations
- **Adjacency Matrix**: O(V²) space, O(1) edge lookup
- **Adjacency List**: O(V + E) space, O(degree) edge lookup

### BFS vs DFS
| | BFS | DFS |
|---|-----|-----|
| Data structure | Queue | Stack (or recursion) |
| Finds | Shortest path (unweighted) | Any path |
| Space | O(V) | O(V) |
| Use when | Shortest path, level-order | Cycle detection, topological sort |

## Sorting Algorithms

| Algorithm | Best | Average | Worst | Stable? | In-place? |
|-----------|------|---------|-------|---------|-----------|
| Bubble | O(n) | O(n²) | O(n²) | Yes | Yes |
| Selection | O(n²) | O(n²) | O(n²) | No | Yes |
| Insertion | O(n) | O(n²) | O(n²) | Yes | Yes |
| Merge | O(n log n) | O(n log n) | O(n log n) | Yes | No |
| Quick | O(n log n) | O(n log n) | O(n²) | No | Yes |
| Heap | O(n log n) | O(n log n) | O(n log n) | No | Yes |`,
      stars: 62,
      downloads: 187,
      author: 'terp_cs_tutor',
    },
  ],

  CMSC216: [
    {
      title: 'C Programming Survival Guide for 216',
      description: 'Pointers, memory management, and the gcc toolchain — the stuff that trips everyone up.',
      content: `# C Programming Survival Guide — CMSC216

## Pointers

### The Mental Model
A pointer is a variable that stores a **memory address**.
\`\`\`c
int x = 42;
int *p = &x;   // p stores the address of x
printf("%d", *p); // 42 — dereference to get the value
\`\`\`

### Common Pointer Mistakes
1. **Dangling pointer**: pointing to freed memory
2. **Null dereference**: \`*NULL\` → segfault
3. **Uninitialized pointer**: random address → undefined behavior
4. **Memory leak**: malloc without free

### Pointer Arithmetic
\`\`\`c
int arr[5] = {10, 20, 30, 40, 50};
int *p = arr;       // points to arr[0]
*(p + 2)            // 30 — same as arr[2]
p++;                // now points to arr[1]
\`\`\`

## Dynamic Memory

### malloc / calloc / realloc / free
\`\`\`c
// Allocate array of 10 ints
int *arr = malloc(10 * sizeof(int));   // uninitialized
int *arr2 = calloc(10, sizeof(int));   // zero-initialized

// Resize
arr = realloc(arr, 20 * sizeof(int));

// ALWAYS free when done
free(arr);
arr = NULL;  // prevent dangling pointer
\`\`\`

### Valgrind Checklist
Run every project through Valgrind before submitting:
\`\`\`bash
valgrind --leak-check=full ./my_program
\`\`\`
Target: "All heap blocks were freed -- no leaks are possible"

## Strings in C

Strings are \`char\` arrays terminated by \`'\\0'\`.
\`\`\`c
char name[] = "Terp";      // compiler adds \\0 automatically
char *greeting = "Hello";   // string literal — READ ONLY

strlen(name);     // 4 (doesn't count \\0)
strcmp(a, b);     // 0 if equal, <0 if a < b, >0 if a > b
strcpy(dst, src); // copies src into dst — dst must be big enough!
strcat(dst, src); // appends src to dst
\`\`\`

## Structs

\`\`\`c
typedef struct {
    char name[50];
    int age;
    float gpa;
} Student;

Student s = {"Alice", 20, 3.8};
Student *sp = &s;
sp->age = 21;  // arrow operator for pointer to struct
\`\`\`

## Makefiles

\`\`\`makefile
CC = gcc
CFLAGS = -Wall -Wextra -std=c99

all: main

main: main.o utils.o
\t$(CC) $(CFLAGS) -o main main.o utils.o

main.o: main.c utils.h
\t$(CC) $(CFLAGS) -c main.c

clean:
\trm -f *.o main
\`\`\`

## GDB Cheat Sheet
| Command | What it does |
|---------|-------------|
| \`break main\` | Set breakpoint at main |
| \`run\` | Start program |
| \`next\` / \`step\` | Next line / step into function |
| \`print x\` | Show value of x |
| \`backtrace\` | Show call stack |
| \`watch x\` | Break when x changes |`,
      stars: 55,
      downloads: 162,
      author: 'terp_cs_tutor',
    },
  ],

  CMSC250: [
    {
      title: 'Discrete Structures — Proof Techniques',
      description: 'Direct proof, contradiction, induction, and contrapositive — with worked examples for every type.',
      content: `# CMSC250 Proof Techniques

## 1. Direct Proof

**Structure:** Assume P is true. Show Q follows.

**Example:** Prove that if n is even, then n² is even.

*Proof:* Assume n is even. Then n = 2k for some integer k.
n² = (2k)² = 4k² = 2(2k²).
Since 2k² is an integer, n² = 2(integer), so n² is even. ∎

## 2. Proof by Contradiction

**Structure:** Assume the statement is false. Derive a contradiction.

**Example:** Prove that √2 is irrational.

*Proof:* Assume √2 is rational. Then √2 = a/b where a, b are integers with no common factors.
Squaring: 2 = a²/b², so a² = 2b².
This means a² is even, so a is even. Write a = 2c.
Then (2c)² = 2b² → 4c² = 2b² → b² = 2c².
So b² is even, hence b is even.
But we said a and b have no common factors — contradiction. ∎

## 3. Proof by Induction

**Structure:**
1. **Base case:** Prove P(0) or P(1).
2. **Inductive step:** Assume P(k). Prove P(k+1).

**Example:** Prove 1 + 2 + ... + n = n(n+1)/2.

*Base case:* n = 1. LHS = 1, RHS = 1(2)/2 = 1. ✓

*Inductive step:* Assume 1 + 2 + ... + k = k(k+1)/2.
Then 1 + 2 + ... + k + (k+1) = k(k+1)/2 + (k+1)
= (k+1)(k/2 + 1) = (k+1)(k+2)/2. ✓ ∎

## 4. Proof by Contrapositive

**Structure:** Instead of P → Q, prove ¬Q → ¬P.

**Example:** Prove that if n² is odd, then n is odd.

*Contrapositive:* If n is even, then n² is even.
n = 2k → n² = 4k² = 2(2k²), which is even. ✓ ∎

## 5. Combinatorics Quick Reference

| Concept | Formula | When to use |
|---------|---------|-------------|
| Permutations | n! / (n-r)! | Order matters |
| Combinations | n! / (r!(n-r)!) | Order doesn't matter |
| Pigeonhole | n items, k boxes → some box has ≥ ⌈n/k⌉ | Existence proofs |
| Inclusion-Exclusion | |A ∪ B| = |A| + |B| - |A ∩ B| | Counting overlaps |

## 6. Logic Equivalences (Exam Must-Know)

| Name | Equivalence |
|------|------------|
| De Morgan's | ¬(P ∧ Q) ≡ ¬P ∨ ¬Q |
| De Morgan's | ¬(P ∨ Q) ≡ ¬P ∧ ¬Q |
| Contrapositive | P → Q ≡ ¬Q → ¬P |
| Biconditional | P ↔ Q ≡ (P → Q) ∧ (Q → P) |
| Double Negation | ¬(¬P) ≡ P |`,
      stars: 41,
      downloads: 119,
      author: 'math_maven',
    },
  ],

  CMSC351: [
    {
      title: 'Algorithms Study Sheet — Midterm Edition',
      description: 'Master theorem, divide-and-conquer, greedy, and dynamic programming with exam-style examples.',
      content: `# CMSC351 Algorithms — Midterm Review

## Asymptotic Notation

| Notation | Meaning | Intuition |
|----------|---------|-----------|
| O(f(n)) | Upper bound | "At most" this fast |
| Ω(f(n)) | Lower bound | "At least" this fast |
| Θ(f(n)) | Tight bound | "Exactly" this fast |
| o(f(n)) | Strict upper | Strictly slower |

### Common Growth Rates (slowest to fastest)
O(1) < O(log n) < O(√n) < O(n) < O(n log n) < O(n²) < O(n³) < O(2ⁿ) < O(n!)

## Master Theorem

For recurrences of the form T(n) = aT(n/b) + Θ(nᵈ):

1. If d < log_b(a): T(n) = Θ(n^{log_b(a)})
2. If d = log_b(a): T(n) = Θ(nᵈ log n)
3. If d > log_b(a): T(n) = Θ(nᵈ)

**Examples:**
- Merge sort: T(n) = 2T(n/2) + Θ(n). a=2, b=2, d=1. Case 2 → Θ(n log n)
- Binary search: T(n) = T(n/2) + Θ(1). a=1, b=2, d=0. Case 2 → Θ(log n)
- Karatsuba: T(n) = 3T(n/2) + Θ(n). a=3, b=2, d=1. Case 1 → Θ(n^{1.58})

## Divide and Conquer

**Pattern:** Split problem → solve subproblems → combine results.

### Merge Sort (canonical example)
\`\`\`
mergeSort(arr, lo, hi):
    if lo >= hi: return
    mid = (lo + hi) / 2
    mergeSort(arr, lo, mid)
    mergeSort(arr, mid+1, hi)
    merge(arr, lo, mid, hi)
\`\`\`

## Dynamic Programming

**When to use:** Optimal substructure + overlapping subproblems.

### The DP Recipe
1. Define the subproblem (what does dp[i] represent?)
2. Write the recurrence relation
3. Identify base cases
4. Decide iteration order (bottom-up) or use memoization (top-down)
5. Reconstruct the solution if needed

### Classic: Longest Common Subsequence
\`\`\`
dp[i][j] = length of LCS of X[1..i] and Y[1..j]

if X[i] == Y[j]:   dp[i][j] = dp[i-1][j-1] + 1
else:               dp[i][j] = max(dp[i-1][j], dp[i][j-1])
\`\`\`
Time: O(mn), Space: O(mn) — can optimize to O(min(m,n))

## Greedy Algorithms

**When to use:** Locally optimal choices lead to globally optimal solution.

**Prove correctness** with exchange argument or greedy stays ahead.

### Classic: Activity Selection
Sort by finish time. Always pick the earliest-finishing compatible activity.

### Classic: Huffman Coding
Build a min-heap of character frequencies. Repeatedly merge two smallest nodes.

## Graph Algorithms (Preview for Final)

| Algorithm | Problem | Time |
|-----------|---------|------|
| BFS | Shortest path (unweighted) | O(V + E) |
| DFS | Cycle detection, topological sort | O(V + E) |
| Dijkstra | Shortest path (non-negative weights) | O((V + E) log V) |
| Bellman-Ford | Shortest path (negative weights OK) | O(VE) |
| Kruskal | Minimum spanning tree | O(E log E) |
| Prim | Minimum spanning tree | O((V + E) log V) |`,
      stars: 58,
      downloads: 201,
      author: 'terp_cs_tutor',
    },
  ],

  MATH140: [
    {
      title: 'Calculus I — Limits, Derivatives & Integrals',
      description: 'The complete MATH140 review covering limits, differentiation rules, and basic integration.',
      content: `# MATH140 Calculus I — Complete Review

## Limits

### Definition
lim(x→a) f(x) = L means f(x) can be made arbitrarily close to L by choosing x sufficiently close to a.

### Limit Laws
- Sum: lim[f(x) + g(x)] = lim f(x) + lim g(x)
- Product: lim[f(x) · g(x)] = lim f(x) · lim g(x)
- Quotient: lim[f(x)/g(x)] = lim f(x) / lim g(x), provided lim g(x) ≠ 0

### Strategies for Evaluating Limits
1. **Direct substitution** — try plugging in first
2. **Factor and cancel** — for 0/0 indeterminate forms
3. **Rationalize** — multiply by conjugate for radicals
4. **L'Hôpital's Rule** — for 0/0 or ∞/∞ forms: lim f/g = lim f'/g'

### Important Limits
- lim(x→0) sin(x)/x = 1
- lim(x→0) (1 - cos(x))/x = 0
- lim(x→∞) (1 + 1/n)ⁿ = e

## Derivatives

### Definition
f'(x) = lim(h→0) [f(x+h) - f(x)] / h

### Differentiation Rules

| Rule | Formula |
|------|---------|
| Power | d/dx[xⁿ] = nxⁿ⁻¹ |
| Constant | d/dx[c] = 0 |
| Sum | (f + g)' = f' + g' |
| Product | (fg)' = f'g + fg' |
| Quotient | (f/g)' = (f'g - fg') / g² |
| Chain | d/dx[f(g(x))] = f'(g(x)) · g'(x) |

### Common Derivatives
| f(x) | f'(x) |
|------|-------|
| sin(x) | cos(x) |
| cos(x) | -sin(x) |
| tan(x) | sec²(x) |
| eˣ | eˣ |
| ln(x) | 1/x |
| aˣ | aˣ · ln(a) |

## Applications of Derivatives

### Related Rates Recipe
1. Draw a picture and label variables
2. Write an equation relating the variables
3. Differentiate both sides with respect to time (implicit differentiation)
4. Plug in known values and solve

### Optimization Recipe
1. Write the function to optimize
2. Find the domain (constraints)
3. Take the derivative, set f'(x) = 0
4. Check critical points AND endpoints
5. Use second derivative test if needed

## Integration

### Antiderivative Rules
| f(x) | ∫f(x)dx |
|------|---------|
| xⁿ (n ≠ -1) | xⁿ⁺¹/(n+1) + C |
| 1/x | ln|x| + C |
| eˣ | eˣ + C |
| sin(x) | -cos(x) + C |
| cos(x) | sin(x) + C |
| sec²(x) | tan(x) + C |

### Fundamental Theorem of Calculus
∫[a to b] f(x)dx = F(b) - F(a), where F'(x) = f(x)

### U-Substitution
When the integrand has the form f(g(x)) · g'(x):
Let u = g(x), du = g'(x)dx.`,
      stars: 72,
      downloads: 245,
      author: 'math_maven',
    },
    {
      title: 'MATH140 Practice Problems with Solutions',
      description: '25 worked problems covering the hardest topics from midterms 1, 2, and the final.',
      content: `# MATH140 Practice Problems

## Limits (Midterm 1)

**Problem 1:** Evaluate lim(x→3) (x² - 9)/(x - 3)

*Solution:* Factor: (x² - 9) = (x - 3)(x + 3)
lim(x→3) (x - 3)(x + 3) / (x - 3) = lim(x→3) (x + 3) = **6**

**Problem 2:** Evaluate lim(x→0) sin(3x) / (5x)

*Solution:* Rewrite: (3/5) · sin(3x)/(3x). As x→0, sin(3x)/(3x) → 1.
Answer: **3/5**

**Problem 3:** Evaluate lim(x→∞) (3x² + 2x) / (5x² - 1)

*Solution:* Divide numerator and denominator by x²:
lim(x→∞) (3 + 2/x) / (5 - 1/x²) = **3/5**

## Derivatives (Midterm 2)

**Problem 4:** Find f'(x) for f(x) = x³ · sin(x)

*Solution:* Product rule: f'(x) = 3x² · sin(x) + x³ · cos(x)

**Problem 5:** Find dy/dx for y = ln(cos(x²))

*Solution:* Chain rule (two layers):
dy/dx = [1/cos(x²)] · [-sin(x²)] · 2x = **-2x · tan(x²)**

**Problem 6:** Find the equation of the tangent line to y = eˣ at x = 0.

*Solution:* y(0) = e⁰ = 1. y'(x) = eˣ, so y'(0) = 1.
Tangent: **y = x + 1**

## Related Rates

**Problem 7:** A balloon's radius increases at 2 cm/s. How fast is the volume increasing when r = 5 cm?

*Solution:* V = (4/3)πr³. dV/dt = 4πr² · dr/dt = 4π(25)(2) = **200π cm³/s**

## Optimization

**Problem 8:** Find the dimensions of a rectangle with perimeter 40 that maximizes area.

*Solution:* P = 2l + 2w = 40, so w = 20 - l.
A = l(20 - l) = 20l - l². A'(l) = 20 - 2l = 0 → l = 10, w = 10.
Max area: **100 square units** (a square!)

## Integration

**Problem 9:** Evaluate ∫(0 to π) sin(x) dx

*Solution:* -cos(x) from 0 to π = -cos(π) - (-cos(0)) = -(-1) + 1 = **2**

**Problem 10:** Evaluate ∫ x · eˣ² dx

*Solution:* Let u = x². Then du = 2x dx, so x dx = du/2.
∫ eᵘ · (du/2) = (1/2)eᵘ + C = **(1/2)eˣ² + C**`,
      stars: 39,
      downloads: 127,
      author: 'math_maven',
    },
  ],

  MATH240: [
    {
      title: 'Linear Algebra Essentials — MATH240',
      description: 'Vectors, matrices, determinants, eigenvalues, and the key theorems that connect them all.',
      content: `# MATH240 Linear Algebra — Essentials

## Vectors and Spaces

### Linear Independence
Vectors v₁, v₂, ..., vₙ are **linearly independent** if:
c₁v₁ + c₂v₂ + ... + cₙvₙ = 0 only when all cᵢ = 0.

**Quick check:** Put vectors as columns in a matrix. Row reduce. If there's a pivot in every column → independent.

### Span and Basis
- **Span** = set of all linear combinations
- **Basis** = linearly independent spanning set
- **Dimension** = number of vectors in a basis

## Matrix Operations

### Row Reduction (RREF)
The workhorse algorithm. Leads to three key questions:
1. **Consistency**: Does Ax = b have a solution? (No row [0 0 ... 0 | nonzero])
2. **Uniqueness**: Is the solution unique? (Pivot in every column)
3. **Null space**: What's ker(A)? (Free variables)

### Determinants
**2×2:** det([a b; c d]) = ad - bc

**3×3:** Cofactor expansion along any row/column.

**Key properties:**
- det(AB) = det(A) · det(B)
- det(Aᵀ) = det(A)
- If any row is all zeros → det = 0
- Row swap → det changes sign
- A is invertible ↔ det(A) ≠ 0

## Eigenvalues and Eigenvectors

### Definition
Av = λv, where λ is an eigenvalue and v is the eigenvector.

### Finding Them
1. Solve det(A - λI) = 0 for λ (characteristic polynomial)
2. For each λ, solve (A - λI)v = 0 for v

### The Big Theorem (Invertible Matrix Theorem)
The following are **all equivalent** for an n×n matrix A:
- A is invertible
- det(A) ≠ 0
- Ax = 0 has only the trivial solution
- Columns of A are linearly independent
- Columns of A span Rⁿ
- A has n pivots
- 0 is NOT an eigenvalue of A
- Null space = {0}
- Rank(A) = n

## Orthogonality

### Dot Product and Projection
- u · v = u₁v₁ + u₂v₂ + ... + uₙvₙ
- proj_v(u) = [(u · v) / (v · v)] · v
- u ⊥ v ↔ u · v = 0

### Gram-Schmidt Process
Given independent vectors {v₁, ..., vₖ}, produce orthogonal vectors:
- u₁ = v₁
- u₂ = v₂ - proj_{u₁}(v₂)
- u₃ = v₃ - proj_{u₁}(v₃) - proj_{u₂}(v₃)

Then normalize: eᵢ = uᵢ / ||uᵢ|| for an orthonormal basis.

## Diagonalization

A = PDP⁻¹ where:
- D = diagonal matrix of eigenvalues
- P = matrix of corresponding eigenvectors (as columns)

**A is diagonalizable iff** it has n linearly independent eigenvectors.`,
      stars: 44,
      downloads: 138,
      author: 'math_maven',
    },
  ],

  BSCI170: [
    {
      title: 'General Biology I — Midterm Study Guide',
      description: 'Cell structure, DNA replication, gene expression, and cell division — organized by exam topic.',
      content: `# BSCI170 General Biology I — Midterm Study Guide

## Cell Structure

### Prokaryotes vs Eukaryotes
| Feature | Prokaryote | Eukaryote |
|---------|-----------|-----------|
| Nucleus | No (nucleoid) | Yes (membrane-bound) |
| Size | 1-10 μm | 10-100 μm |
| Organelles | Few | Many |
| DNA | Circular, single | Linear, chromosomes |
| Examples | Bacteria, Archaea | Plants, Animals, Fungi |

### Key Organelles
- **Nucleus**: Contains DNA, site of transcription
- **Ribosomes**: Protein synthesis (free = cytoplasmic proteins, bound = secreted/membrane proteins)
- **Endoplasmic Reticulum**: Rough ER (protein processing), Smooth ER (lipid synthesis, detox)
- **Golgi Apparatus**: Modify, sort, and ship proteins
- **Mitochondria**: ATP production via cellular respiration
- **Chloroplasts**: Photosynthesis (plants only)
- **Lysosomes**: Digestion of cellular waste

### Membrane Structure
Phospholipid bilayer with embedded proteins (fluid mosaic model):
- **Integral proteins**: Span the membrane (channels, transporters)
- **Peripheral proteins**: Attached to surface (signaling, structural)
- **Cholesterol**: Regulates fluidity

## DNA Replication

### Key Enzymes
| Enzyme | Function |
|--------|----------|
| Helicase | Unwinds double helix |
| Primase | Synthesizes RNA primer |
| DNA Pol III | Extends new strand (5'→3') |
| DNA Pol I | Replaces RNA primers with DNA |
| Ligase | Seals gaps between Okazaki fragments |
| Topoisomerase | Relieves torsional strain |

### Leading vs Lagging Strand
- **Leading strand**: Continuous synthesis toward the fork
- **Lagging strand**: Discontinuous (Okazaki fragments), synthesized away from fork

## Gene Expression

### Central Dogma
DNA → (transcription) → mRNA → (translation) → Protein

### Transcription
1. RNA polymerase binds promoter
2. Reads template strand 3'→5'
3. Builds mRNA 5'→3'
4. In eukaryotes: add 5' cap, poly-A tail, splice out introns

### Translation
1. Ribosome assembles at start codon (AUG = methionine)
2. tRNA brings amino acids; anticodon pairs with mRNA codon
3. Peptide bonds form between amino acids
4. Stops at stop codon (UAA, UAG, UGA)

## Cell Division

### Mitosis (somatic cells)
Produces 2 identical diploid daughter cells.
**Phases:** Prophase → Metaphase → Anaphase → Telophase → Cytokinesis

### Meiosis (gametes)
Produces 4 unique haploid cells.
**Key differences from mitosis:**
- Two rounds of division (Meiosis I and II)
- Crossing over in Prophase I (genetic recombination)
- Independent assortment (random chromosome alignment in Metaphase I)
- Result: genetic diversity

### Meiosis I vs Meiosis II
| Feature | Meiosis I | Meiosis II |
|---------|-----------|-----------|
| Separates | Homologous pairs | Sister chromatids |
| Crossing over | Yes (Prophase I) | No |
| Cells produced | 2 haploid | 4 haploid |
| Resembles | Unique process | Mitosis |`,
      stars: 36,
      downloads: 104,
      author: 'bio_nerd_umd',
    },
  ],

  CHEM131: [
    {
      title: 'General Chemistry I — Key Concepts & Formulas',
      description: 'Atomic structure, bonding, stoichiometry, and thermodynamics in one organized reference.',
      content: `# CHEM131 General Chemistry I — Key Concepts

## Atomic Structure

### Quantum Numbers
| Number | Symbol | Values | Describes |
|--------|--------|--------|-----------|
| Principal | n | 1, 2, 3, ... | Energy level (shell) |
| Angular momentum | l | 0 to n-1 | Orbital shape (s, p, d, f) |
| Magnetic | mₗ | -l to +l | Orbital orientation |
| Spin | mₛ | +½ or -½ | Electron spin |

### Electron Configuration Rules
1. **Aufbau Principle**: Fill lowest energy orbitals first
2. **Pauli Exclusion**: Max 2 electrons per orbital, opposite spins
3. **Hund's Rule**: Fill degenerate orbitals singly before pairing

### Periodic Trends
| Property | Across period → | Down group ↓ |
|----------|----------------|--------------|
| Atomic radius | Decreases | Increases |
| Ionization energy | Increases | Decreases |
| Electronegativity | Increases | Decreases |
| Electron affinity | More negative | Less negative |

## Chemical Bonding

### Bond Types
- **Ionic**: Metal + nonmetal. Transfer electrons. High melting point.
- **Covalent**: Nonmetal + nonmetal. Share electrons.
- **Metallic**: Metal + metal. Sea of electrons.

### Lewis Structures
1. Count total valence electrons
2. Place least electronegative atom in center
3. Connect atoms with single bonds
4. Distribute remaining electrons (lone pairs on outer atoms first)
5. Check octets; form double/triple bonds if needed

### VSEPR Shapes
| Electron groups | Molecular geometry | Bond angle | Example |
|----------------|-------------------|------------|---------|
| 2 | Linear | 180° | CO₂ |
| 3 | Trigonal planar | 120° | BF₃ |
| 4 | Tetrahedral | 109.5° | CH₄ |
| 3 + 1 lone pair | Trigonal pyramidal | ~107° | NH₃ |
| 2 + 2 lone pairs | Bent | ~104.5° | H₂O |

## Stoichiometry

### The Mole
1 mol = 6.022 × 10²³ particles (Avogadro's number)

### Molar Mass
Sum of atomic masses from periodic table. Example: H₂O = 2(1.008) + 16.00 = 18.02 g/mol

### Limiting Reagent
1. Convert all reactants to moles
2. Divide each by its coefficient
3. Smallest quotient = limiting reagent
4. Use limiting reagent to calculate product

## Thermodynamics

### Key Terms
- **Enthalpy (ΔH)**: Heat at constant pressure. Negative = exothermic.
- **Entropy (ΔS)**: Measure of disorder. Positive = more disorder.
- **Gibbs Free Energy**: ΔG = ΔH - TΔS. Negative = spontaneous.

### Hess's Law
ΔH_rxn = Σ ΔH_f(products) - Σ ΔH_f(reactants)

### Calorimetry
q = mcΔT (where m = mass, c = specific heat, ΔT = temperature change)`,
      stars: 28,
      downloads: 83,
      author: 'chem_whiz',
    },
  ],

  ENGL101: [
    {
      title: 'Academic Writing Toolkit — ENGL101',
      description: 'Thesis construction, paragraph structure, citation formats, and common grammar pitfalls.',
      content: `# ENGL101 Academic Writing Toolkit

## Building a Strong Thesis

A thesis statement should be **arguable**, **specific**, and **supportable**.

### Weak vs Strong Thesis
- Weak: "Social media is bad for society."
- Strong: "Social media platforms undermine democratic discourse by amplifying misinformation through algorithmic recommendation systems that prioritize engagement over accuracy."

### The Thesis Formula
Topic + Position + Reasoning = Thesis

Example: *Remote work* (topic) *improves employee productivity* (position) *because it eliminates commute stress and allows flexible scheduling* (reasoning).

## Paragraph Structure (PIE Method)

**P**oint: State the main idea (topic sentence)
**I**llustration: Provide evidence — quotes, data, examples
**E**xplanation: Analyze how the evidence supports your point

### Example Paragraph
"The rise of AI writing tools has fundamentally changed academic integrity policies. [POINT] According to a 2024 survey by the International Center for Academic Integrity, 68% of universities have revised their honor codes specifically to address generative AI use. [ILLUSTRATION] This rapid policy shift demonstrates that institutions recognize AI as a structural challenge rather than simply a new form of plagiarism, requiring systemic responses rather than individual punishments. [EXPLANATION]"

## Source Integration

### Three Methods
1. **Direct quote**: Use exact words in quotation marks. Best for memorable or precise phrasing.
2. **Paraphrase**: Restate in your own words. Best for complex ideas you want to simplify.
3. **Summary**: Condense a larger passage. Best for providing context.

### Signal Phrases
Instead of just dropping quotes, introduce them:
- Smith argues that "..."
- According to recent research, "..."
- As Johnson demonstrates in her analysis, "..."

## Citation Quick Reference

### MLA (Humanities)
- In-text: (Author Page) → (Smith 42)
- Works Cited entry: Last, First. *Title*. Publisher, Year.

### APA (Social Sciences)
- In-text: (Author, Year) → (Smith, 2024)
- References entry: Last, F. (Year). Title. *Journal*, Volume(Issue), Pages.

## Common Grammar Issues

### Comma Splices
Wrong: "I studied all night, I still failed."
Right: "I studied all night, but I still failed." (add conjunction)
Right: "I studied all night; I still failed." (use semicolon)

### Pronoun-Antecedent Agreement
Wrong: "Each student should bring their laptop." (informal)
Better: "Students should bring their laptops." (make both plural)

### Active vs Passive Voice
Passive: "The experiment was conducted by the researchers."
Active: "The researchers conducted the experiment."
Use active voice by default. Passive is OK when the actor is unknown or unimportant.

## Revision Checklist
- Does every paragraph have a clear topic sentence?
- Does each paragraph connect to the thesis?
- Are all sources cited properly?
- Have I varied sentence structure?
- Did I read the paper aloud to catch awkward phrasing?`,
      stars: 22,
      downloads: 71,
      author: 'prof_notes_daily',
    },
  ],
}

/* ─── Main ────────────────────────────────────────────────────────── */

async function main() {
  console.log('📚 Seeding study sheet content...\n')

  const umd = await prisma.school.findFirst({ where: { short: 'UMD' } })
  if (!umd) {
    console.error('UMD school not found. Run the primary seed script first: node prisma/seed.js')
    process.exit(1)
  }

  // Ensure seed authors exist
  const authorMap = {}
  for (const author of AUTHORS) {
    let user = await prisma.user.findUnique({ where: { username: author.username } })
    if (!user) {
      const password = process.env.SEED_USER_PASSWORD || require('crypto').randomBytes(12).toString('base64url')
      user = await prisma.user.create({
        data: {
          username: author.username,
          passwordHash: await bcrypt.hash(password, 12),
          role: author.role,
          emailVerified: true,
        },
      })
      console.log(`  Created author: ${author.username}`)
    }
    authorMap[author.username] = user
  }

  let created = 0
  let skipped = 0

  for (const [courseCode, sheets] of Object.entries(SEED_SHEETS)) {
    const course = await prisma.course.findFirst({
      where: { code: courseCode, schoolId: umd.id },
    })

    if (!course) {
      console.log(`  ⚠️  Course ${courseCode} not found at UMD — skipping ${sheets.length} sheets`)
      skipped += sheets.length
      continue
    }

    for (const sheet of sheets) {
      // Skip if a sheet with this title already exists in this course
      const existing = await prisma.studySheet.findFirst({
        where: { title: sheet.title, courseId: course.id },
      })

      if (existing) {
        skipped++
        continue
      }

      const author = authorMap[sheet.author]
      await prisma.studySheet.create({
        data: {
          title: sheet.title,
          description: sheet.description || '',
          content: sheet.content,
          courseId: course.id,
          userId: author.id,
          stars: sheet.stars || 0,
          downloads: sheet.downloads || 0,
          contentFormat: 'markdown',
          status: 'published',
        },
      })

      // Enroll author in the course if not already enrolled
      await prisma.enrollment.upsert({
        where: {
          userId_courseId: { userId: author.id, courseId: course.id },
        },
        create: { userId: author.id, courseId: course.id },
        update: {},
      })

      created++
    }

    console.log(`  ✅ ${courseCode}: ${sheets.length} sheets`)
  }

  console.log(`\n🎉 Content seeding complete!`)
  console.log(`   ${created} sheets created, ${skipped} skipped (already exist)`)
  console.log(`   ${AUTHORS.length} seed authors`)
  console.log(`   ${Object.keys(SEED_SHEETS).length} courses with content`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
