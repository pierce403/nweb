function nwebSearch()
{
  console.log("HELLO THERE");

  document.getElementById("message").textContent = "Hey, thanks for searching";

  fetch('search?q=hostname:softbank219168179195.bbtec.net&f=json')
    .then(response => response.json())
    .then(data => console.log(data));
}
