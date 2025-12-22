// Quick test of skeletonizer with JS only
import { skeletonize } from './src/core/skeletonizer.js';

const jsCode = `
function calculateSum(a, b) {
    const result = a + b;
    console.log("Sum is:", result);
    return result;
}

class MyClass {
    constructor(name) {
        this.name = name;
    }
    
    greet() {
        console.log("Hello " + this.name);
        return "Hello " + this.name;
    }
}

export { calculateSum, MyClass };
`;

console.log('=== Testing JS Skeletonization ===\n');
const result = await skeletonize(jsCode, 'test.js');
console.log(result);
console.log('\n=== Test Complete ===');
