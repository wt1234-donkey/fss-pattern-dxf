const assert = require('assert');
const {spawnSync} = require('child_process');
const C = require('./core.js');
const {generatedPython} = require('./codegen.js');
const g = {
  width:8,height:8,ox:4,oy:4,
  loops:[
    {hole:false,points:[[-3,-3],[3,-3],[3,3],[-3,3]]},
    {hole:true,points:[[-2,-2],[-2,2],[2,2],[2,-2]]},
    {hole:false,points:[[-1,-1],[1,-1],[1,1],[-1,1]]},
    {hole:true,points:[[-0.5,-0.5],[-0.5,0.5],[0.5,0.5],[0.5,-0.5]]}
  ]
};
const py=generatedPython(g,{kind:'pypssfss',grid:32});
const cad=generatedPython(g,{kind:'dxf',guide:true});
assert(py.includes('clas="J"')); // metal patch, not its complementary slot
assert(py.includes('make_pattern_matrix'));
assert(cad.includes('METAL_OUTER'));
assert(cad.includes('METAL_HOLE'));
assert(cad.includes('CELL_GUIDE'));
assert(py.includes('LEFT_MM = GEOMETRY'));
assert.equal((py.match(/"points":/g)||[]).length,4);
assert.throws(()=>generatedPython({...g,loops:[{...g.loops[0],open:true}]},{kind:'dxf'}),/未闭合/);
assert.throws(()=>generatedPython(g,{kind:'pypssfss',grid:999}),/网格/);
const rect={...g,width:10};
assert(generatedPython(rect,{kind:'dxf'}).includes('"width_mm": 10'));
const pyrect=generatedPython(rect,{kind:'pypssfss'});
assert(pyrect.includes('requires a square'));
const python = process.env.PYTHON || 'python3';
for(const script of [py,cad,pyrect]){
  const result=spawnSync(python,['-c','import sys,ast;ast.parse(sys.stdin.read())'],{input:script,encoding:'utf8'});
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr);
}
const run=spawnSync(python,['-c',py + '\nmat = make_pattern_matrix()\nassert mat.shape == (32,32)\nassert mat[0,0] == 0\nassert mat[5,5] == 1\nassert mat[10,10] == 0\nassert mat[13,13] == 1\nassert mat[15,15] == 0\n'],{encoding:'utf8'});
if(run.error)throw run.error;
assert.equal(run.status,0,run.stderr);
const rectValidation='namespace = {"__name__": "imported_test_module"}\nexec(' + JSON.stringify(pyrect) + ', namespace)\ntry:\n    namespace["make_pattern_matrix"]()\nexcept ValueError as e:\n    assert "square" in str(e)\nelse:\n    raise AssertionError("rectangular cell should be rejected")\n';
const rectRun=spawnSync(python,['-c',rectValidation],{encoding:'utf8'});
assert.equal(rectRun.status,0,rectRun.stderr);
const scaled=C.scale({w:10,h:10,bounds:[0,0,10,10],loops:[{hole:false,points:[[2,2],[8,2],[8,8],[2,8]]}]},{width:8,height:8,reference:'image',center:true});
assert(generatedPython(scaled,{kind:'dxf'}).includes('"left_mm": -4'));
const index=require('fs').readFileSync('index.html','utf8');
assert(index.includes('id="codegen-code"'));
assert(index.includes('id="codeDownload"'));
assert(index.includes('FSSCodegen.generatedPython'));
assert(index.includes("document.documentElement.outerHTML")); // offline version embeds generator
console.log('PASS: code generation, holes/islands, precise loops, Python syntax, 32x32 metal mask, rectangular-cell guard and UI');
