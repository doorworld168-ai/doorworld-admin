import{r as o}from"./index-7w3i19Oo.js";function n(e,t=300){const[r,s]=o.useState(e);return o.useEffect(()=>{const u=setTimeout(()=>s(e),t);return()=>clearTimeout(u)},[e,t]),r}export{n as u};
