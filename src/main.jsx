import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjsLib from 'pdfjs-dist';
import './style.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

function App(){
  const [fileName,setFileName]=useState('');
  const [pdfBytes,setPdfBytes]=useState(null);
  const [pdfDoc,setPdfDoc]=useState(null);
  const [pages,setPages]=useState([]);
  const [page,setPage]=useState(1);
  const [zoom,setZoom]=useState(1.15);
  const [selected,setSelected]=useState(null);
  const [replacement,setReplacement]=useState('');
  const [fontBytes,setFontBytes]=useState(null);
  const [fontName,setFontName]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('Upload a PDF to start editing.');
  const [edits,setEdits]=useState([]);
  const fileRef=useRef(null), fontRef=useRef(null), canvasRef=useRef(null);
  const current=pages[page-1];

  async function loadFile(file){
    if(!file || file.type!=='application/pdf'){setNotice('Please choose a PDF file.');return;}
    setBusy(true); setNotice('Loading PDF…');
    try{
      const buf=await file.arrayBuffer();
      const copy=buf.slice(0);
      const loading=pdfjsLib.getDocument({data:new Uint8Array(buf)});
      const doc=await loading.promise;
      const list=[];
      for(let i=1;i<=doc.numPages;i++){
        const p=await doc.getPage(i);
        const vp=p.getViewport({scale:1});
        const tc=await p.getTextContent();
        list.push({page:p,viewport:vp,items:tc.items.filter(x=>x.str && x.str.trim()),renderScale:1});
      }
      setPdfBytes(copy);setPdfDoc(doc);setPages(list);setPage(1);setFileName(file.name);setSelected(null);setEdits([]);
      setNotice(`${doc.numPages} page${doc.numPages===1?'':'s'} loaded. Select any highlighted text to edit.`);
    }catch(e){console.error(e);setNotice('Could not open this PDF. It may be encrypted, damaged, or unsupported.');}
    finally{setBusy(false);}
  }

  useEffect(()=>{
    if(!current || !canvasRef.current)return;
    let cancelled=false;
    (async()=>{
      const scale=zoom;
      const vp=current.page.getViewport({scale});
      const canvas=canvasRef.current,ctx=canvas.getContext('2d');
      canvas.width=Math.ceil(vp.width*devicePixelRatio);canvas.height=Math.ceil(vp.height*devicePixelRatio);
      canvas.style.width=`${vp.width}px`;canvas.style.height=`${vp.height}px`;
      ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
      await current.page.render({canvasContext:ctx,viewport:vp}).promise;
      if(!cancelled){
        const root=canvas.parentElement.querySelector('.text-overlay');
        root.innerHTML='';
        current.items.forEach((it,idx)=>{
          const m=pdfjsLib.Util.transform(vp.transform,it.transform);
          const h=Math.max(7,Math.hypot(m[2],m[3]));
          const left=m[4], top=m[5]-h;
          const span=document.createElement('button');
          span.type='button';span.className='text-hit';span.textContent=it.str;
          span.style.left=`${left}px`;span.style.top=`${top}px`;
          span.style.width=`${Math.max(8,it.width*scale)}px`;span.style.height=`${Math.max(9,h*1.35)}px`;
          span.style.fontSize=`${h}px`;
          span.title='Click to edit this text';
          span.addEventListener('click',()=>{setSelected({page:page,index:idx,item:it,rect:{left,top,width:Math.max(8,it.width*scale),height:Math.max(9,h*1.35)},scale});setReplacement(it.str);});
          root.appendChild(span);
        });
      }
    })();
    return ()=>{cancelled=true;};
  },[current,zoom,page]);

  function chooseFont(file){
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{setFontBytes(reader.result);setFontName(file.name);setNotice(`Font loaded: ${file.name}`);};
    reader.readAsArrayBuffer(file);
  }

  async function applyEdit(){
    if(!selected || !replacement.trim()){setNotice('Select text and enter replacement text.');return;}
    const edit={page:selected.page,index:selected.index,oldText:selected.item.str,newText:replacement,rect:selected.rect,item:selected.item};
    const nextEdits=[...edits.filter(x=>!(x.page===edit.page&&x.index===edit.index)),edit];
    setEdits(nextEdits);
    setSelected(null);
    setNotice('Edit applied. Your updated PDF is downloading…');
    await download(nextEdits);
  }

  async function download(changes=edits){
    if(!pdfBytes)return;
    setBusy(true);setNotice('Preparing your edited PDF…');
    try{
      const out=await PDFDocument.load(pdfBytes);
      out.registerFontkit(fontkit);
      let embedded;
      if(fontBytes){
        try{embedded=await out.embedFont(new Uint8Array(fontBytes),{subset:true});}
        catch(e){console.warn('Could not embed uploaded font',e);embedded=await out.embedFont(StandardFonts.Helvetica);}
      }else embedded=await out.embedFont(StandardFonts.Helvetica);
      for(const e of changes){
        const p=out.getPage(e.page-1);
        const src=pages[e.page-1];
        const vp=src.page.getViewport({scale:e.rect.scale || zoom});
        const [x1,y1]=vp.convertToPdfPoint(e.rect.left,e.rect.top);
        const [x2,y2]=vp.convertToPdfPoint(e.rect.left+e.rect.width,e.rect.top+e.rect.height);
        const x=Math.min(x1,x2),y=Math.min(y1,y2),w=Math.abs(x2-x1),h=Math.abs(y2-y1);
        p.drawRectangle({x:x-1,y:y-1,width:w+2,height:h+2,color:rgb(1,1,1),borderWidth:0});
        const size=Math.max(6,Math.min(e.item.height||12,h*0.78));
        p.drawText(e.newText,{x:x,y:y+h*0.13,size,font:embedded,color:rgb(0,0,0),maxWidth:Math.max(20,w*3),lineHeight:size});
      }
      const bytes=await out.save();
      const blob=new Blob([bytes],{type:'application/pdf'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;
      const stem=fileName.replace(/\.pdf$/i,'')||'document';
      a.download=`${stem}-edited.pdf`;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
      setNotice(`Downloaded ${stem}-edited.pdf`);
    }catch(e){console.error(e);setNotice('Could not save this PDF. Try another file or remove the uploaded font.');}
    finally{setBusy(false);}
  }

  const total=pages.length;
  return <div className="app">
    <header className="topbar"><div className="brand"><div className="logo">P</div><div><strong>PDF Studio</strong><small>Precise PDF editing</small></div></div><div className="top-actions"><button className="btn ghost" onClick={()=>fileRef.current?.click()}>＋ Open PDF</button><button className="btn primary" disabled={!pdfBytes||busy} onClick={download}>{busy?'Working…':'↓ Download PDF'}</button></div></header>
    <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e=>loadFile(e.target.files?.[0])}/>
    <input ref={fontRef} type="file" accept=".ttf,.otf,.woff,.woff2" hidden onChange={e=>chooseFont(e.target.files?.[0])}/>
    <main>
      {!pdfBytes ? <section className="welcome"><div className="welcome-icon">▤</div><h1>Edit your PDF.<br/><span>Keep the rest untouched.</span></h1><p>Open a PDF, select the text you want to change, and download your edited document.</p><button className="btn primary large" onClick={()=>fileRef.current?.click()}>Choose PDF file</button><div className="privacy">⌑ Your files stay on your device. Nothing is uploaded.</div><div className="features"><div><b>01</b><strong>Click to edit</strong><small>Select text directly on the page.</small></div><div><b>02</b><strong>Preserve layout</strong><small>Unedited page content is retained.</small></div><div><b>03</b><strong>Download</strong><small>Save your updated PDF instantly.</small></div></div></section>:
      <div className="workspace">
        <aside className="sidebar"><div className="side-label">DOCUMENT</div><div className="file-card"><div className="pdf-icon">PDF</div><div className="file-info"><strong>{fileName}</strong><small>{total} pages</small></div></div><div className="side-label">EDIT TEXT</div>
          {selected?<div className="edit-panel"><label>Selected text</label><div className="original">{selected.item.str}</div><label htmlFor="replacement">Replace with</label><textarea id="replacement" value={replacement} onChange={e=>setReplacement(e.target.value)} rows="4" autoFocus/><label>Font matching</label><button className="btn outline full" onClick={()=>fontRef.current?.click()}>{fontName?'✓ '+fontName:'＋ Upload matching font'}</button><small className="hint">Upload a TTF/OTF font if you have the original font file. Otherwise Helvetica is used for replacement text.</small><div className="edit-buttons"><button className="btn primary full" onClick={applyEdit}>Apply edit</button><button className="btn ghost full" onClick={()=>setSelected(null)}>Cancel</button></div></div>:<div className="empty-edit"><div className="cursor-icon">⌖</div><strong>Select text on the page</strong><p>Click any text in the document to open the editor.</p></div>}
          <div className="side-label staged-label">PENDING CHANGES <span>{edits.length}</span></div>{edits.length?edits.map((e,i)=><div className="change" key={i}><small>Page {e.page}</small><del>{e.oldText}</del><strong>{e.newText}</strong><button onClick={()=>setEdits(v=>v.filter((_,j)=>j!==i))}>Remove</button></div>):<p className="no-changes">Your edits will appear here.</p>}
          <div className="sidebar-bottom"><div className="privacy-mini">⌑ Local processing · Private by design</div></div>
        </aside>
        <section className="viewer"><div className="toolbar"><div className="page-control"><button disabled={page<=1} onClick={()=>{setPage(p=>p-1);setSelected(null)}}>‹</button><span>{page} <i>/</i> {total}</span><button disabled={page>=total} onClick={()=>{setPage(p=>p+1);setSelected(null)}}>›</button></div><div className="zoom-control"><button onClick={()=>setZoom(z=>Math.max(.5,+(z-.15).toFixed(2)))}>−</button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.min(2.5,+(z+.15).toFixed(2)))}>＋</button></div></div>
          <div className="canvas-scroll"><div className="page-wrap" style={{width:current?.viewport.width*zoom||'auto',height:current?.viewport.height*zoom||'auto'}}><canvas ref={canvasRef}/><div className="text-overlay"/></div></div>
          <div className="status"><span className="status-dot"/>{notice}</div>
        </section>
      </div>}
    </main>
    <footer><span>PDF STUDIO</span><span>Built for your documents · Works in your browser</span></footer>
  </div>
}
createRoot(document.getElementById('root')).render(<App/>);
