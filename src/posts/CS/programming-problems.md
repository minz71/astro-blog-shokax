---
title: "程式題目"
date: 2023-11-02
tags:
  - "程式碼"
  - "物件導向"
categories:
  - "CS"
---

# call by value (傳值)

- 在Call-by-Value中，函式的參數是被傳遞值的**副本**。
- 在函式內部，對參數的修改不會影響到原始的變數。

:::info

### call by address (傳位置)

- 傳了實際的記憶體位置進去function
- 也是`call by value`的變形，但傳遞的是**記憶體地址**。
- 在函式內部，通過指標可以修改原始變數的值。

:::

# call by reference (傳參考)

- 在Call-by-Reference中，函式的參數接受原始變數的參考（或記憶體位置）。
- 在函式內部，對參數的修改會直接影響到原始的變數。

```cpp 範例
#include <iostream>

// Call-by-Value (值傳遞)
void incrementByValue(int value) {
    value++;
}

// Call-by-Reference using pointer (指標參考傳遞)
void incrementByPointer(int* ptr) {
    (*ptr)++;
}

// Call-by-Reference using reference (參考傳遞)
void incrementByReference(int& ref) {
    ref++;
}

int main() {
    int num = 10;

    incrementByValue(num);        // 傳遞值
    std::cout << "Call-by-Value: " << num << std::endl;  // 輸出：10

    incrementByPointer(&num);     // 傳遞指標參考
    std::cout << "Call-by-Pointer: " << num << std::endl; // 輸出：11

    incrementByReference(num);    // 傳遞參考
    std::cout << "Call-by-Reference: " << num << std::endl; // 輸出：12

    return 0;
}

```

|                |        傳值        |        傳地址        |         傳參考         |
| :------------: | :----------------: | :------------------: | :--------------------: |
|                | `incrementByValue` | `incrementByPointer` | `incrementByReference` |
| 傳入函式的東西 |       整數值       |  整數指標(指標變數)  |        整數引用        |
|  原始的`num`   | 不影響(因為是副本) |        會影響        |         會影響         |

# 印星星

```cpp 印星星
#include <iostream>
using namespace std;

void printUpperTriangle(int n) {
    for (int i = 0; i < n; i++) {
        for (int j = 0; j <= i; j++) {
            cout << "* ";
        }
        cout << endl;
    }
}

void printLowerTriangle(int n) {
    for (int i = n; i > 0; i--) {
        for (int j = 0; j < i; j++) {
            cout << "* ";
        }
        cout << endl;
    }
}

int main() {
    int n;
    cout << "請輸入行數: ";
    cin >> n;

    cout << "上三角形：" << endl;
    printUpperTriangle(n);

    cout << "下三角形：" << endl;
    printLowerTriangle(n);

    return 0;
}

```

# 用遞迴寫階乘

```cpp 用遞迴寫階乘
#include <iostream>
using namespace std;

// 定義遞迴函式計算階乘
int factorial(int n) {
    // Base case: 當 n 為 0 或 1 時，階乘為 1
    if (n == 0 || n == 1) {
        return 1;
    }
    // 遞迴呼叫：將問題分解為較小的子問題
    // 階乘 n 可以表示為 n 乘上 (n-1) 的階乘
    return n * factorial(n - 1);
}

int main() {
    int num;
    cout << "請輸入一個正整數: ";
    cin >> num;

    // 呼叫遞迴函式計算階乘
    int result = factorial(num);

    cout << num << " 的階乘是: " << result << endl;

    return 0;
}
```

# 找出陣列中第二大的數字

```cpp 找出陣列中第二大的數字
#include <iostream>
using namespace std;

int findSecondLargest(int arr[], int size) {
    int largest = INT_MIN;  // 初始化最大值為int類型的最小值
    int secondLargest = INT_MIN;  // 初始化第二大值為int類型的最小值

    // 遍歷數組，更新最大值和第二大值
    for (int i = 0; i < size; i++) {
        if (arr[i] > largest) {
            secondLargest = largest;
            largest = arr[i];
        } else if (arr[i] > secondLargest && arr[i] != largest) {
            secondLargest = arr[i];
        }
    }

    return secondLargest;
}

int main() {
    int arr[] = {5, 2, 9, 1, 7, 4};  // 範例數組
    int size = sizeof(arr) / sizeof(arr[0]);  // 計算數組大小

    // 調用函數找到第二大的數
    int secondLargest = findSecondLargest(arr, size);

    cout << "第二大的數字是: " << secondLargest << endl;

    return 0;
}

```

# 給定一數字，找出因數

```cpp 給定一數字，找出因數
#include <iostream>
#include <vector>

using namespace std;

// 找出給定數字的因數
vector<int> findFactors(int num) {
    vector<int> factors;

    // 從 1 開始遍歷到 num 的平方根
    for (int i = 1; i * i <= num; i++) {
        if (num % i == 0) {
            factors.push_back(i); // 將因數 i 加入 factors
            if (i != num / i) {
                factors.push_back(num / i); // 將因數 num/i 加入 factors
            }
        }
    }

    return factors;
}

int main() {
    int num;
    cout << "請輸入一個正整數：";
    cin >> num;

    vector<int> factors = findFactors(num);

    cout << num << " 的因數有：";
    for (int factor : factors) {
        cout << factor << " ";
    }
    cout << endl;

    return 0;
}
```

# 判斷質數

```cpp 判斷質數
#include <iostream>
#include <cmath>

using namespace std;

// 判斷一個數字是否為質數
bool isPrime(int number) {
    // 負數和小於等於 1 的數字不是質數
    if (number <= 1) {
        return false;
    }

    // 使用平方根的方法進行質數判斷
    // 如果一個數字 n 是合數（非質數）
    // 那麼它必定可以分解為兩個因數 a 和 b
    // 其中 a 和 b 都不大於 sqrt(n)
    int sqrtNumber = sqrt(number);
    for (int i = 2; i <= sqrtNumber; i++) {
        if (number % i == 0) {
            return false;
        }
    }

    // 如果沒有找到能整除 number 的數字，則 number 是質數
    return true;
}

// 測試程式碼
int main() {
    int number;

    cout << "請輸入一個數字：";
    cin >> number;

    // 呼叫 isPrime 函式判斷是否為質數
    bool result = isPrime(number);

    // 根據結果輸出訊息
    if (result) {
        cout << number << " 是質數" << endl;
    } else {
        cout << number << " 不是質數" << endl;
    }

    return 0;
}

```

# 判斷子字串

```cpp 判斷子字串
#include <iostream>
#include <string>

using namespace std;

// 判斷一個字串是否為另一個字串的子字串
bool isSubstring(const string& str, const string& substring) {
    // 如果子字串長度大於原始字串，則直接返回 false
    if (substring.length() > str.length()) {
        return false;
    }

    // 遍歷原始字串，逐個比較字元
    for (size_t i = 0; i <= str.length() - substring.length(); i++) {
        bool isMatch = true;

        // 檢查子字串是否匹配
        for (size_t j = 0; j < substring.length(); j++) {
            if (str[i + j] != substring[j]) {
                isMatch = false;
                break;
            }
        }

        // 如果子字串匹配，則返回 true
        if (isMatch) {
            return true;
        }
    }

    // 沒有找到匹配的子字串，返回 false
    return false;
}

// 測試程式碼
int main() {
    string str, substring;

    cout << "請輸入一個字串：";
    getline(cin, str);

    cout << "請輸入一個子字串：";
    getline(cin, substring);

    // 呼叫 isSubstring 函式判斷是否為子字串
    bool result = isSubstring(str, substring);

    // 根據結果輸出訊息
    if (result) {
        cout << substring <<  " 是 "  << str <<  "的子字串" << endl;
    } else {
        cout << substring << " 不是 " << str <<" 的子字串 " << endl;
    }

    return 0;
}

```

- 使用迴圈逐個比較字元的方式來實現。

1. 檢查子字串的長度是否大於原始字串的長度，如果是，則直接返回 false，因為子字串不可能是原始字串的子字串。

2. 使用兩個嵌套的迴圈。外層迴圈遍歷原始字串，內層迴圈檢查從當前位置開始的子字串是否匹配。如果在內層迴圈中找到了不匹配的字元，則設置 `isMatch` 為 false，並且跳出內層迴圈。

# Binary Search Tree

```cpp 二元搜尋樹
#include <iostream>

using namespace std;

// 定義二元搜尋樹的節點結構
struct Node {
    int data;
    Node* left;
    Node* right;

    // 節點的建構函式
    Node(int value) {
        data = value;
        left = nullptr;
        right = nullptr;
    }
};

// 搜尋操作
bool search(Node* root, int value) {
    // 若樹為空則返回 false
    if (root == nullptr) {
        return false;
    }

    // 若找到了目標值，則返回 true
    if (root->data == value) {
        return true;
    }

    // 若目標值比根節點的值小，則在左子樹中搜尋
    if (value < root->data) {
        return search(root->left, value);
    }

    // 若目標值比根節點的值大，則在右子樹中搜尋
    return search(root->right, value);
}

// 插入操作
Node* insert(Node* root, int value) {
    // 若樹為空，則創建一個新節點並返回
    if (root == nullptr) {
        return new Node(value);
    }

    // 若目標值比根節點的值小，則插入左子樹中
    if (value < root->data) {
        root->left = insert(root->left, value);
    }

    // 若目標值比根節點的值大，則插入右子樹中
    else if (value > root->data) {
        root->right = insert(root->right, value);
    }

    // 若目標值等於根節點的值，不插入，直接返回根節點
    // 返回根節點
    return root;
}

// 刪除操作
Node* remove(Node* root, int value) {
    // 若樹為空，則返回空指針
    if (root == nullptr) {
        return root;
    }

    // 若目標值比根節點的值小，則在左子樹中刪除
    if (value < root->data) {
        root->left = remove(root->left, value);
    }
    // 若目標值比根節點的值大，則在右子樹中刪除
    else if (value > root->data) {
        root->right = remove(root->right, value);
    }
    // 若找到了目標值
    else {
        // 情況1：沒有子節點或只有一個子節點
        if (root->left == nullptr) {
            Node* temp = root->right;
            delete root;
            return temp;
        }
        else if (root->right == nullptr) {
            Node* temp = root->left;
            delete root;
            return temp;
        }

        // 情況2：有兩個子節點
        // 找到右子樹中的最小值節點
        Node* minNode = root->right;
        while (minNode->left != nullptr) {
            minNode = minNode->left;
        }
        // 複製最小值到目標節點
        root->data = minNode->data;
        // 在右子樹中刪除最小值節點
        root->right = remove(root->right, minNode->data);
    }

    // 返回修改後的根節點
    return root;
}

// 測試程式碼
int main() {
    // 建立一個二元搜尋樹
    Node* root = nullptr;
    root = insert(root, 50);
    root = insert(root, 30);
    root = insert(root, 20);
    root = insert(root, 40);
    root = insert(root, 70);
    root = insert(root, 60);
    root = insert(root, 80);

    // 搜尋值 40
    if (search(root, 40)) {
        cout << "搜尋到值 40" << endl;
    } else {
        cout << "未找到值 40" << endl;
    }

    // 刪除值 30
    root = remove(root, 30);

    // 搜尋值 30
    if (search(root, 30)) {
        cout << "搜尋到值 30" << endl;
    } else {
        cout << "未找到值 30" << endl;
    }

    return 0;
}

```

我們使用 `struct` 定義了二元搜尋樹的節點結構，每個節點包含一個整數數據、左子樹指針和右子樹指針。

- `search` 函式實現了搜尋操作。它遞迴地在二元搜尋樹中搜尋目標值。如果樹為空則返回 `false`，如果找到了目標值則返回 `true`，否則根據目標值與根節點數據的比較結果遞迴地在左子樹或右子樹中搜尋。

- `insert` 函式實現了插入操作。它遞迴地在二元搜尋樹中找到合適的位置插入新節點。如果樹為空則創建一個新節點，否則根據目標值與根節點數據的比較結果遞迴地在左子樹或右子樹中插入。如果目標值等於根節點的值，則不進行插入操作（忽略重複值）。

- `remove` 函式實現了刪除操作。它遞迴地在二元搜尋樹中找到目標值所在的節點，並根據不同情況進行刪除。若目標節點沒有子節點或只有一個子節點，則直接刪除該節點並返回相應的子節點。若目標節點有兩個子節點，則找到右子樹中的最小值節點，將最小值複製到目標節點，然後在右子樹中刪除最小值節點。

在 `main` 函式中，插入了一些節點，然後使用 `search` 函式搜尋值 40，並根據結果輸出相應的訊息。
接著，我們刪除值 30 的節點，再次使用 `search` 函式搜尋值 30，並根據結果輸出相應的訊息。

# 找出矩陣中第二大的數字

```cpp 找出矩陣中第二大的數字
#include <iostream>
#include <vector>
#include <climits> // 包含 INT_MIN 的定義

using namespace std;

int findSecondLargest(const vector<vector<int>>& matrix) {
    int largest = INT_MIN; // 最大數字
    int secondLargest = INT_MIN; // 第二大數字

    // 遍歷矩陣，找出最大數字和第二大數字
    for (const auto& row : matrix) {
        for (int num : row) {
            if (num > largest) {
                secondLargest = largest;
                largest = num;
            } else if (num > secondLargest && num < largest) {
                secondLargest = num;
            }
        }
    }

    return secondLargest;
}

int main() {
    // 定義矩陣
    vector<vector<int>> matrix = {
        {4, 5, 6},
        {7, 10, 9},
        {2, 8, 3}
    };

    // 呼叫函式找出第二大的數字
    int secondLargest = findSecondLargest(matrix);

    // 輸出結果
    if (secondLargest != INT_MIN) {
        cout << "矩陣中第二大的數字為: " << secondLargest << endl;
    } else {
        cout << "矩陣中沒有第二大的數字" << endl;
    }

    return 0;
}

```

# 轉置矩陣

```cpp 轉置矩陣
#include <iostream>
using namespace std;

const int MAX_SIZE = 100;  // 定義矩陣的最大大小

void transposeMatrix(int matrix[][MAX_SIZE], int rows, int cols) {
    int transposedMatrix[MAX_SIZE][MAX_SIZE];  // 用於儲存轉置後的矩陣

    // 轉置矩陣
    for (int i = 0; i < rows; i++) {
        for (int j = 0; j < cols; j++) {
            transposedMatrix[j][i] = matrix[i][j];
        }
    }

    // 列印轉置後的矩陣
    cout << "轉置矩陣：" << endl;
    for (int i = 0; i < cols; i++) {
        for (int j = 0; j < rows; j++) {
            cout << transposedMatrix[i][j] << " ";
        }
        cout << endl;
    }
}

int main() {
    int matrix[MAX_SIZE][MAX_SIZE];  // 定義原始矩陣
    int rows, cols;  // 矩陣的行數和列數

    // 輸入矩陣的行數和列數
    cout << "請輸入矩陣的行數：";
    cin >> rows;
    cout << "請輸入矩陣的列數：";
    cin >> cols;

    // 輸入矩陣元素
    cout << "請輸入矩陣的元素：" << endl;
    for (int i = 0; i < rows; i++) {
        for (int j = 0; j < cols; j++) {
            cin >> matrix[i][j];
        }
    }

    // 計算並列印轉置矩陣
    transposeMatrix(matrix, rows, cols);

    return 0;
}
```

# 兩個矩陣相乘

```cpp 兩個矩陣相乘
#include <iostream>
#include <vector>

using namespace std;

// 函式：矩陣相乘
vector<vector<int>> matrixMultiply(const vector<vector<int>>& matrix1, const vector<vector<int>>& matrix2) {
    int rows1 = matrix1.size();    // 矩陣1的列數
    int cols1 = matrix1[0].size(); // 矩陣1的行數（矩陣2的列數）
    int rows2 = matrix2.size();    // 矩陣2的列數
    int cols2 = matrix2[0].size(); // 矩陣2的行數

    // 檢查矩陣是否可以相乘
    if (cols1 != rows2) {
        cout << "矩陣的尺寸不符合乘法規則" << endl;
        return vector<vector<int>>();
    }

    // 建立結果矩陣，初始化為全0
    vector<vector<int>> result(rows1, vector<int>(cols2, 0));

    // 進行矩陣相乘運算
    for (int i = 0; i < rows1; i++) {
        for (int j = 0; j < cols2; j++) {
            for (int k = 0; k < cols1; k++) {
                result[i][j] += matrix1[i][k] * matrix2[k][j];
            }
        }
    }

    return result;
}

int main() {
    // 定義兩個矩陣
    vector<vector<int>> matrix1 = {{1, 2}, {3, 4}};
    vector<vector<int>> matrix2 = {{5, 6}, {7, 8}};

    // 呼叫矩陣相乘函式
    vector<vector<int>> result = matrixMultiply(matrix1, matrix2);

    // 輸出結果矩陣
    cout << "矩陣相乘的結果：" << endl;
    for (const auto& row : result) {
        for (const auto& element : row) {
            cout << element << " ";
        }
        cout << endl;
    }

    return 0;
}

```

# 矩陣乘向量

```cpp 矩陣乘向量
#include <iostream>
#include <vector>

using namespace std;

// 計算矩陣與向量的乘積
vector<double> matrixVectorMultiply(const vector<vector<double>>& matrix, const vector<double>& vector) {
    int rows = matrix.size();
    int cols = matrix[0].size();

    // 檢查矩陣與向量的尺寸是否符合乘法規則
    if (cols != vector.size()) {
        cout << "矩陣與向量的尺寸不符合乘法規則" << endl;
        return vector<double>();
    }

    // 創建結果向量，初始化為零
    vector<double> result(rows, 0.0);

    // 進行矩陣與向量的乘法
    for (int i = 0; i < rows; i++) {
        for (int j = 0; j < cols; j++) {
            result[i] += matrix[i][j] * vector[j];
        }
    }

    return result;
}

// 測試程式碼
int main() {
    // 定義矩陣
    vector<vector<double>> matrix = {{1, 2, 3},
                                     {4, 5, 6},
                                     {7, 8, 9}};

    // 定義向量
    vector<double> vector = {1, 2, 3};

    // 計算矩陣與向量的乘積
    vector<double> result = matrixVectorMultiply(matrix, vector);

    // 輸出結果
    cout << "乘積結果：";
    for (double value : result) {
        cout << value << " ";
    }
    cout << endl;

    return 0;
}

```
