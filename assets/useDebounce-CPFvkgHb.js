import{r as o}from"./index-Dg3qSDtQ.js";function n(e,t=300){const[r,s]=o.useState(e);return o.useEffect(()=>{const u=setTimeout(()=>s(e),t);return()=>clearTimeout(u)},[e,t]),r}export{n as u};
