// Test file
function exampleFunction(a, b) {
    const sum = a + b;
    console.log("Result:", sum);
    return sum;
}

class TestClass {
    constructor(name) {
        this.name = name;
    }

    greet() {
        return `Hello, ${this.name}!`;
    }
}

export { exampleFunction, TestClass };
