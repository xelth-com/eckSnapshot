Run this command and return the output:
```
node -e "console.log(['ENV', process.platform+'/'+require('os').arch(), process.version, require('fs').readdirSync('.').some(f=>f.endsWith('.sqlite')||f.endsWith('.sqlite3'))?'SQLite':'none', require('path').basename(process.cwd())].join('|'))"
```