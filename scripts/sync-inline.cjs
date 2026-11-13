// Keep the downloadable single-file tool identical to the reviewed modules.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),file=path.join(root,'index.html');
let html=fs.readFileSync(file,'utf8');
for(const [id,name] of [['core-code','core.js'],['advanced-code','advanced.js'],['cleanup-code','cleanup.js'],['cleanup-ui-code','cleanup-ui.js'],['redraw-code','redraw.js'],['redraw-ui-code','redraw-ui.js'],['codegen-code','codegen.js']]){
 const pattern=new RegExp('(<script id="'+id+'">)[\\s\\S]*?(</script>)');
 if(!pattern.test(html))throw Error('Missing inline script '+id);
 html=html.replace(pattern,(_,a,b)=>a+fs.readFileSync(path.join(root,name),'utf8')+b);
}
fs.writeFileSync(file,html);
