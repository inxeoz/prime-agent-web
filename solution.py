def product_except_self(nums):
    """O(n) time, O(1) extra. No division. Returns products except self."""
    n = len(nums)
    if n == 0:
        return []
    res = [1] * n
    prefix = 1
    for i in range(n):
        res[i] = prefix
        prefix *= nums[i]
    suffix = 1
    for i in range(n - 1, -1, -1):
        res[i] *= suffix
        suffix *= nums[i]
    return res

productExceptSelf = product_except_self

class Solution:
    def productExceptSelf(self, nums):
        return product_except_self(nums)
    def productsOfArrayDiscludingSelf(self, nums):
        return product_except_self(nums)

if __name__ == "__main__":
    assert product_except_self([1,2,4,6]) == [48,24,12,8]
    assert product_except_self([-1,0,1,2,3]) == [0,-6,0,0,0]
    assert product_except_self([0,0,2]) == [0,0,0]
    assert product_except_self([2,3]) == [3,2]
    assert product_except_self([]) == []
    assert product_except_self([5]) == [1]
    import random, math
    for _ in range(200):
        a = [random.randint(-5,5) for _ in range(random.randint(2,12))]
        expect = [math.prod(a[:i]+a[i+1:]) for i in range(len(a))]
        assert product_except_self(a) == expect
    print("self-check passed")
