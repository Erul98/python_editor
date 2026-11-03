import type { TestCase, TestMode } from '@/types/fs';

export interface ProblemTemplate {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  fileName: string;
  testMode: TestMode;
  entryFunction?: string;
  code: string;
  testCases: TestCase[];
}

export const PROBLEM_TEMPLATES: ProblemTemplate[] = [
  {
    id: 'two-sum-lc',
    title: '1. Two Sum (LeetCode Solution Class)',
    difficulty: 'Easy',
    fileName: 'lc_two_sum.py',
    testMode: 'function',
    entryFunction: 'twoSum',
    code: `# 1. Two Sum (LeetCode Style — Function Call Mode)
# Chế độ 'Function' tự động khởi tạo class Solution() và gọi twoSum(nums, target)
from typing import List


class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, num in enumerate(nums):
            complement = target - num
            if complement in seen:
                return [seen[complement], i]
            seen[num] = i
        return []
`,
    testCases: [
      { id: 'ts-1', input: 'nums = [2, 7, 11, 15]\ntarget = 9', expectedOutput: '[0, 1]' },
      { id: 'ts-2', input: 'nums = [3, 2, 4]\ntarget = 6', expectedOutput: '[1, 2]' },
      { id: 'ts-3', input: 'nums = [3, 3]\ntarget = 6', expectedOutput: '[0, 1]' },
    ],
  },
  {
    id: 'valid-parentheses',
    title: '20. Valid Parentheses',
    difficulty: 'Easy',
    fileName: 'valid_parentheses.py',
    testMode: 'function',
    entryFunction: 'isValid',
    code: `# 20. Valid Parentheses (Stack)
class Solution:
    def isValid(self, s: str) -> bool:
        pairs = {')': '(', ']': '[', '}': '{'}
        stack = []
        for ch in s:
            if ch in pairs:
                if not stack or stack.pop() != pairs[ch]:
                    return False
            else:
                stack.append(ch)
        return len(stack) == 0
`,
    testCases: [
      { id: 'vp-1', input: 's = "()"', expectedOutput: 'true' },
      { id: 'vp-2', input: 's = "()[]{}"', expectedOutput: 'true' },
      { id: 'vp-3', input: 's = "(]"', expectedOutput: 'false' },
      { id: 'vp-4', input: 's = "([])"', expectedOutput: 'true' },
    ],
  },
  {
    id: 'longest-substring',
    title: '3. Longest Substring Without Repeating Characters',
    difficulty: 'Medium',
    fileName: 'longest_substring.py',
    testMode: 'function',
    entryFunction: 'lengthOfLongestSubstring',
    code: `# 3. Longest Substring Without Repeating Characters (Sliding Window)
class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        last_seen = {}
        left = 0
        best = 0
        for right, ch in enumerate(s):
            if ch in last_seen and last_seen[ch] >= left:
                left = last_seen[ch] + 1
            last_seen[ch] = right
            best = max(best, right - left + 1)
        return best
`,
    testCases: [
      { id: 'ls-1', input: 's = "abcabcbb"', expectedOutput: '3' },
      { id: 'ls-2', input: 's = "bbbbb"', expectedOutput: '1' },
      { id: 'ls-3', input: 's = "pwwkew"', expectedOutput: '3' },
    ],
  },
  {
    id: 'coin-change',
    title: '322. Coin Change (Dynamic Programming)',
    difficulty: 'Medium',
    fileName: 'coin_change.py',
    testMode: 'function',
    entryFunction: 'coinChange',
    code: `# 322. Coin Change (Bottom-up DP)
from typing import List


class Solution:
    def coinChange(self, coins: List[int], amount: int) -> int:
        INF = amount + 1
        dp = [0] + [INF] * amount
        for a in range(1, amount + 1):
            for c in coins:
                if c <= a:
                    dp[a] = min(dp[a], dp[a - c] + 1)
        return dp[amount] if dp[amount] != INF else -1
`,
    testCases: [
      { id: 'cc-1', input: 'coins = [1, 2, 5]\namount = 11', expectedOutput: '3' },
      { id: 'cc-2', input: 'coins = [2]\namount = 3', expectedOutput: '-1' },
      { id: 'cc-3', input: 'coins = [1]\namount = 0', expectedOutput: '0' },
    ],
  },
  {
    id: 'num-islands',
    title: '200. Number of Islands (BFS / Graph)',
    difficulty: 'Medium',
    fileName: 'number_of_islands.py',
    testMode: 'function',
    entryFunction: 'numIslands',
    code: `# 200. Number of Islands (BFS)
from collections import deque
from typing import List


class Solution:
    def numIslands(self, grid: List[List[str]]) -> int:
        if not grid:
            return 0
        R, C = len(grid), len(grid[0])
        islands = 0

        for r in range(R):
            for c in range(C):
                if grid[r][c] == "1":
                    islands += 1
                    grid[r][c] = "0"
                    q = deque([(r, c)])
                    while q:
                        cr, cc = q.popleft()
                        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                            nr, nc = cr + dr, cc + dc
                            if 0 <= nr < R and 0 <= nc < C and grid[nr][nc] == "1":
                                grid[nr][nc] = "0"
                                q.append((nr, nc))
        return islands
`,
    testCases: [
      {
        id: 'ni-1',
        input: 'grid = [["1","1","1","1","0"],["1","1","0","1","0"],["1","1","0","0","0"],["0","0","0","0","0"]]',
        expectedOutput: '1',
      },
      {
        id: 'ni-2',
        input: 'grid = [["1","1","0","0","0"],["1","1","0","0","0"],["0","0","1","0","0"],["0","0","0","1","1"]]',
        expectedOutput: '3',
      },
    ],
  },
];

