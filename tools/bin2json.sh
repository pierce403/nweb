if [ $# -eq 0 ]
  then
    echo "usage: bin2json masscanbinary.bin"
fi

masscan --readscan $1 -oJ masscan.json

