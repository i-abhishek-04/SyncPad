export const CODE_TEMPLATES = {
  python: `# SyncPad Collaborative Python Scratchpad

def two_sum(nums: list[int], target: int) -> list[int]:
    """Find two numbers in nums that add up to target."""
    seen = {}
    for i, num in enumerate(nums):
        diff = target - num
        if diff in seen:
            return [seen[diff], i]
        seen[num] = i
    return []

# Test execution:
print("Result:", two_sum([2, 7, 11, 15], 9))
`,
  javascript: `// SyncPad Collaborative JavaScript Scratchpad

class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return -1;
    const val = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  put(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value);
    if (this.cache.size > this.capacity) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }
}
`,
  cpp: `// SyncPad Collaborative C++ Scratchpad
#include <iostream>
#include <vector>

void binarySearch(const std::vector<int>& arr, int target) {
    int left = 0, right = arr.size() - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) {
            std::cout << "Found at index " << mid << std::endl;
            return;
        }
        if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    std::cout << "Not found" << std::endl;
}

int main() {
    std::vector<int> nums = {1, 3, 5, 7, 9, 11};
    binarySearch(nums, 7);
    return 0;
}
`,
  markup: `<!-- SyncPad Collaborative HTML Scratchpad -->
<div class="card">
  <h2>SyncPad Pair Programming</h2>
  <p>Real-time CRDT state sync engine.</p>
  <button onclick="alert('Synced!')">Click Me</button>
</div>
`,
  markdown: `# SyncPad Notes

## Pair Programming Agenda
- [x] Set up CRDT sync room
- [ ] Implement Two Sum solution
- [ ] Review performance & time complexity
`,
  java: `// SyncPad Collaborative Java Scratchpad

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, SyncPad Java Environment!");
        
        int[] numbers = {10, 20, 30, 40, 50};
        int sum = 0;
        for (int num : numbers) {
            sum += num;
        }
        System.out.println("Sum of elements: " + sum);
    }
}
`,
};
