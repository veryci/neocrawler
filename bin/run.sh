pm2 start run.js -n schedule_bbs39 -- -i bbs39 -a schedule
pm2 start run.js -n crawl_bbs39 -- -i bbs39 -a crawl
pm2 start run.js -n schedule_dxy -- -i dxy -a schedule
pm2 start run.js -n crawl_dxy -- -i dxy -a crawl
pm2 start run.js -n schedule_babytree -- -i babytree -a schedule
pm2 start run.js -n crawl_babytree -- -i babytree -a crawl
