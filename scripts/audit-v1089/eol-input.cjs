const fs=require('node:fs');const original=fs.readFileSync;
fs.readFileSync=function(...args){const value=original.apply(this,args);if(typeof value!=='string'||!/\.(js|jsx|mjs|cjs|sql)$/.test(String(args[0])))return value;const lf=value.replace(/\r\n/g,'\n');return process.env.AUDIT_EOL==='CRLF'?lf.replace(/\n/g,'\r\n'):lf;};
