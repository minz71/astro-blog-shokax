---
title: "演算法"
date: 2023-11-02
tags:
  - "演算法"
  - "程式碼"
categories:
  - "CS"
---

# DP跟divide and conquer差在哪

**分而治之法 (Divide and Conquer)** 如果問題很大，我們就把問題**分解成較小的子問題**，然後分別解決這些子問題。一旦所有的子問題都解決了，我們就把所有子問題的解決方案組合起來，找到大問題的解決方案。分治法的限制是子問題應該與原問題屬於同一類型。例如，如果主要問題是排序，那麼子問題也應該是排序。分治法的策略本質上是遞迴的。

動態規劃(**Dynamic Programming**) 則是將優化問題分解成更簡單的子問題，並**存儲**每個子問題的解決方案，以便每個子問題只需要解決一次。一旦所有的子問題都解決了，我們就將每個子問題的結果連接起來，找到初始問題的解決方案。

當我們看到一個遞迴解決方案對於相同的輸入有重複的調用時，我們可以使用動態規劃來優化它。

這種方法的想法是簡單地**存儲子問題**的結果，這樣我們就不需要在以後需要時重新計算它們。

例如，如果我們寫出斐波那契數列的簡單遞迴解決方案，我們會得到指數時間複雜度，如果我們通過存儲子問題的解決方案來優化它，時間複雜度就會從指數級**降低到線性級**。

# 初階排序

- stable sorting : 相同的值排序後順序皆一樣
- unstable sorting : 相同的值排序後順序可能會不一樣

```cpp 排序演算法
#include <iostream>
#include <vector>
#include <algorithm>

using namespace std;

// Bubble Sort mark:3-4
void bubbleSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                swap(arr[j], arr[j + 1]);
            }
        }
    }
}

// Selection Sort
// 1. 先選這輪的最小
// 2. 跟i交換
void selectionSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n - 1; i++) {
        int minIndex = i;
        for (int j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIndex]) {
                minIndex = j;
            }
        }
        swap(arr[i], arr[minIndex]);
    }
}

// Insertion Sort
// 1. 依序給這一輪的value
// 2. value跟前面的比
// 3. 放到完成的位置
void insertionSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 1; i < n; i++) {
        int key = arr[i];
        int j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = key;
    }
}

int main() {
    vector<int> arr = {5, 2, 8, 3, 1};

    // Bubble Sort
    bubbleSort(arr);
    cout << "Bubble Sort: ";
    for (int num : arr) {
        cout << num << " ";
    }
    cout << endl;

    // Selection Sort
    arr = {5, 2, 8, 3, 1};
    selectionSort(arr);
    cout << "Selection Sort: ";
    for (int num : arr) {
        cout << num << " ";
    }
    cout << endl;

    // Insertion Sort
    arr = {5, 2, 8, 3, 1};
    insertionSort(arr);
    cout << "Insertion Sort: ";
    for (int num : arr) {
        cout << num << " ";
    }
    cout << endl;

    return 0;
}

```

# Quick sort

快速排序（Quick Sort）是一種常用的排序算法，它通過選擇一個基準元素，將數列分割成兩個子數列，並將比基準元素小的元素放在基準元素的左邊，比基準元素大的元素放在基準元素的右邊，然後對子數列進行遞迴排序，最終實現整個數列的排序。

下面是一個簡單的範例來說明快速排序的過程：

假設我們要對數列 [7, 2, 1, 6, 8, 5, 3] 進行排序。

1. 選擇基準元素：從數列中選擇一個基準元素，通常選擇第一個或最後一個元素。在這個例子中，我們選擇第一個元素 7 作為基準元素。
2. 分割操作：將數列重新排列，小於基準元素的元素放在左邊，大於基準元素的元素放在右邊。在這個例子中，我們將小於 7 的元素放在左邊，大於 7 的元素放在右邊，得到 [2, 1, 6, 5, 3, 7, 8]。
3. 遞迴排序：對左右兩個子數列進行遞迴排序，重複上述步驟。在這個例子中，我們對左子數列 [2, 1, 6, 5, 3] 和右子數列 [8] 進行遞迴排序。
4. 合併結果：將排序後的左子數列、基準元素和排序後的右子數列合併在一起。在這個例子中，最終得到排序後的數列 [1, 2, 3, 5, 6, 7, 8]。

```cpp
#include <iostream>
#include <vector>

using namespace std;

// 快速排序 (Quick Sort)
// 最壞情況時間複雜度：O(n^2)
// 平均情況時間複雜度：O(nlogn)
// 最佳情況時間複雜度：O(nlogn)
int partition(vector<int>& arr, int low, int high) {
    int pivot = arr[high]; // 選擇最後一個元素作為主元
    int i = low - 1;

    for (int j = low; j < high; j++) {
        if (arr[j] < pivot) {
            i++;
            swap(arr[i], arr[j]);
        }
    }

    swap(arr[i + 1], arr[high]);
    return i + 1;
}

void quickSort(vector<int>& arr, int low, int high) {
    if (low < high) {
        int pivotIndex = partition(arr, low, high);

        // 遞迴地對分割後的子陣列進行排序
        quickSort(arr, low, pivotIndex - 1);
        quickSort(arr, pivotIndex + 1, high);
    }
}
int main() {
    vector<int> arr = {5, 2, 8, 3, 1};

    // 快速排序
    cout << "快速排序結果：" << endl;
    quickSort(arr, 0, arr.size() - 1);
    for (int num : arr) {
        cout << num << " ";
    }
    cout << endl;

    return 0;
}

```

在快速排序中，我們使用 `partition` 函式將陣列分割為比主元小和比主元大的兩個子陣列。
然後，我們遞迴地對這兩個子陣列進行排序，直到排序完成。

快速排序是一種高效的排序算法，平均時間複雜度為 O(nlogn)，但在最壞情況下可能達到 O(n^2)。
