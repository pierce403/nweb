import {BrowserProvider} from 'ethers';
const message=document.getElementById('msg'),button=document.getElementById('wallet-login');
if(message)message.textContent=window.ethereum?'Sign a message to log in. No transaction is needed.':'A wallet browser is required to log in.';
button?.addEventListener('click',async()=>{
 try{
  if(!window.ethereum)throw new Error('A wallet browser is required to log in.');
  const provider=new BrowserProvider(window.ethereum);await provider.send('eth_requestAccounts',[]);
  if((await provider.getNetwork()).chainId!==1n)throw new Error('Switch your wallet to Ethereum Mainnet.');
  const signer=await provider.getSigner(),address=await signer.getAddress(),now=Math.floor(Date.now()/1000),epoch=now-now%600;
  const domain=document.querySelector('meta[name="auth-domain"]').content;
  const signature=await signer.signMessage(`Signing in to ${domain} at ${epoch}`);
  const response=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([address,signature])});
  if(!response.ok)throw new Error(response.status===503?'The site is temporarily read-only.':'The signed login was not accepted.');
  const result=await response.json();if(!result.login)throw new Error('The signed login was not accepted.');location.reload();
 }catch(error){if(message)message.textContent=error.message;}
});
