## Git Commit Workflow

**IMPORTANT**: This project is a Git repository. After successfully completing any development task, you MUST propose a Git commit as the final step.

### Commit Process
1. **Review Changes**: Before committing, briefly summarize what was accomplished
2. **Stage Files**: Include `git add .` or specific files in your command block
3. **Create Commit**: Use a clear, descriptive commit message following this format:
   - Start with the task context (e.g., "feat:", "fix:", "docs:", "refactor:")
   - Include the task_id from your command block for traceability
   - Keep it under 50 characters for the first line
   - Add detailed description if needed

### Example Git Commands to Include
```bash
git add .
git commit -m "feat: implement user authentication system

Task ID: auth-system-implementation-1
- Added login/register endpoints
- Implemented JWT token validation
- Added user session management"
```

### When to Commit
- After completing any feature implementation
- After fixing bugs or issues
- After refactoring or code improvements
- After adding tests or documentation
- Before major architectural changes

**Remember**: Always include the Git commit step in your final command block to ensure proper version control and project history.