/**
 * Code snippets gợi ý cho các pattern DSA phổ biến.
 * Cú pháp `${1:placeholder}` theo chuẩn snippet của VS Code / Monaco.
 */
export interface DsaSnippet {
  label: string;
  detail: string;
  body: string;
}

export const DSA_SNIPPETS: DsaSnippet[] = [
  {
    label: 'cp-template',
    detail: 'Competitive programming template (fast I/O)',
    body: `import sys
input = sys.stdin.readline


def solve():
    \${1:n} = int(input())
    \${0:pass}


if __name__ == "__main__":
    solve()`,
  },
  {
    label: 'bfs',
    detail: 'Breadth-First Search trên đồ thị',
    body: `from collections import deque


def bfs(\${1:graph}, \${2:start}):
    visited = {\${2:start}}
    q = deque([\${2:start}])
    while q:
        node = q.popleft()
        for nei in \${1:graph}[node]:
            if nei not in visited:
                visited.add(nei)
                q.append(nei)
    return visited`,
  },
  {
    label: 'dfs',
    detail: 'Depth-First Search (đệ quy)',
    body: `import sys
sys.setrecursionlimit(10**6)


def dfs(\${1:node}, \${2:graph}, visited):
    visited.add(\${1:node})
    for nei in \${2:graph}[\${1:node}]:
        if nei not in visited:
            dfs(nei, \${2:graph}, visited)`,
  },
  {
    label: 'binary-search',
    detail: 'Binary search tìm vị trí đầu tiên thỏa điều kiện',
    body: `def binary_search(\${1:arr}, \${2:target}):
    lo, hi = 0, len(\${1:arr})
    while lo < hi:
        mid = (lo + hi) // 2
        if \${1:arr}[mid] < \${2:target}:
            lo = mid + 1
        else:
            hi = mid
    return lo`,
  },
  {
    label: 'two-pointers',
    detail: 'Two pointers trên mảng đã sắp xếp',
    body: `left, right = 0, len(\${1:arr}) - 1
while left < right:
    s = \${1:arr}[left] + \${1:arr}[right]
    if s == \${2:target}:
        \${0:break}
    elif s < \${2:target}:
        left += 1
    else:
        right -= 1`,
  },
  {
    label: 'sliding-window',
    detail: 'Sliding window kích thước thay đổi',
    body: `from collections import defaultdict

count = defaultdict(int)
left = 0
best = 0
for right, ch in enumerate(\${1:s}):
    count[ch] += 1
    while \${2:len(count) > k}:
        count[\${1:s}[left]] -= 1
        if count[\${1:s}[left]] == 0:
            del count[\${1:s}[left]]
        left += 1
    best = max(best, right - left + 1)`,
  },
  {
    label: 'dijkstra',
    detail: 'Dijkstra shortest path với heapq',
    body: `import heapq


def dijkstra(\${1:graph}, \${2:src}):
    dist = {\${2:src}: 0}
    pq = [(0, \${2:src})]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, float("inf")):
            continue
        for v, w in \${1:graph}[u]:
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist`,
  },
  {
    label: 'union-find',
    detail: 'Disjoint Set Union (path compression + union by rank)',
    body: `class DSU:
    def __init__(self, n):
        self.parent = list(range(n))
        self.rank = [0] * n

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.rank[ra] < self.rank[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        if self.rank[ra] == self.rank[rb]:
            self.rank[ra] += 1
        return True`,
  },
  {
    label: 'topo-sort',
    detail: "Topological sort (Kahn's algorithm)",
    body: `from collections import deque


def topo_sort(\${1:n}, \${2:edges}):
    graph = [[] for _ in range(\${1:n})]
    indeg = [0] * \${1:n}
    for u, v in \${2:edges}:
        graph[u].append(v)
        indeg[v] += 1
    q = deque(i for i in range(\${1:n}) if indeg[i] == 0)
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in graph[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)
    return order if len(order) == \${1:n} else []`,
  },
  {
    label: 'memo-dp',
    detail: 'Top-down DP với lru_cache',
    body: `from functools import lru_cache


@lru_cache(maxsize=None)
def dp(\${1:i}):
    if \${1:i} \${2:<= 1}:
        return \${3:1}
    return \${0:dp(i - 1) + dp(i - 2)}`,
  },
  {
    label: 'listnode',
    detail: 'Định nghĩa Linked List (LeetCode style)',
    body: `class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


def build_list(values):
    dummy = cur = ListNode()
    for v in values:
        cur.next = ListNode(v)
        cur = cur.next
    return dummy.next`,
  },
  {
    label: 'treenode',
    detail: 'Định nghĩa Binary Tree + build từ list level-order',
    body: `from collections import deque


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def build_tree(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q = deque([root])
    i = 1
    while q and i < len(values):
        node = q.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            q.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            q.append(node.right)
        i += 1
    return root`,
  },
  {
    label: 'trie',
    detail: 'Trie (prefix tree)',
    body: `class Trie:
    def __init__(self):
        self.root = {}

    def insert(self, word):
        node = self.root
        for ch in word:
            node = node.setdefault(ch, {})
        node["#"] = True

    def search(self, word, prefix=False):
        node = self.root
        for ch in word:
            if ch not in node:
                return False
            node = node[ch]
        return prefix or "#" in node`,
  },
];

