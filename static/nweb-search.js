function nwebSearch()
{
  console.log("HELLO THERE");

  document.getElementById("msg").textContent = "Hey, thanks for searching";

  fetch('https://nweb.io/?q=hostname:softbank219168179195.bbtec.net&f=json')
    .then(response => response.json())
    .then(data => console.log(data));
}
