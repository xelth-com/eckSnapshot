// Manual verification script for skeletonizer
import { skeletonize } from './src/core/skeletonizer.js';

const pythonCode = `
def calculate_sum(a, b):
    result = a + b
    print(f"Sum: {result}")
    return result

class Calculator:
    def add(self, x, y):
        return x + y
`;

const javaCode = `
public class Example {
    public int add(int a, int b) {
        int sum = a + b;
        return sum;
    }
}
`;

const jsCode = `
function test() {
    const x = 5;
    return x * 2;
}
`;

console.log('Testing Python:');
const pythonResult = await skeletonize(pythonCode, 'test.py');
console.log(pythonResult);
console.log('\n---\n');

console.log('Testing Java:');
const javaResult = await skeletonize(javaCode, 'Test.java');
console.log(javaResult);
console.log('\n---\n');

console.log('Testing JavaScript:');
const jsResult = await skeletonize(jsCode, 'test.js');
console.log(jsResult);
