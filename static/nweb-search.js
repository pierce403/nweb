document.getElementById('nweb-search-form').addEventListener('submit', function(e) {
    nwebSearch();
    e.preventDefault();
}, false);

function nwebSearch()
{      
  console.log("HELLO THERE");
       
  search = document.getElementById("nweb-search").value;
  document.getElementById("message").textContent = "Searching for '"+search+"'";

  nwebResult = fetch('search?f=json&q='+search)
    .then(response => response.json())
    .then(function(data){
       let nwebTable = document.getElementById("nweb-table");
       console.log(data);
       nwebTable.innerHTML = ""

  for(let host of data)
  {
   console.log(host.hostname);
   let row = nwebTable.insertRow(-1);
   left = host.ip+'\n\nhostname: '+host.hostname+'\nports: '+host.ports

   row.insertCell().innerText = left;
   row.insertCell().innerText = host.nmap_data;

  }
  document.getElementById("message").textContent = "Searching for '"+search+"' *complete*";

  })
  

}

document.getElementById("nweb-search").value="nmap";
nwebSearch();
