export const colors={blue:'#55bce5',orange:'#f59b23',yellow:'#f5e940'};
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
const h1star=[1,15,28,32,45,46,65,69,88,92,105,106,110,14,29,30,31,66,67,68,89,90,91,94,95,96,97,98,111,112,113];
const h1prime=[...range(2,13),...range(16,27),114,115,116];
const h1yellow=[1,14,15,28,32,45,46,65,69,88,92,105,106,110];
const h1orange=[29,30,31,66,67,68,89,90,91,...range(94,98),...range(111,119)];
const h2gold=[120,129,130,138,139,150,151,152,...range(162,172),174,184];
const h2orange=[129,150,162,...range(163,171),173];
const h2yellow=[120,130,138,139,151,152,172,174,184];
export const tiers={starPrime:{hall:1,price:100000,count:31},prime:{hall:1,price:75000,count:27},platinum:{hall:1,price:50000,count:61},starGold:{hall:2,price:50000,count:1},golden:{hall:2,price:40000,count:21},silver:{hall:2,price:25000,count:52}};
export const stalls=Array.from({length:193},(_,i)=>{
 const n=i+1,hall=n<120?1:2;
 const tier=hall===1?(h1star.includes(n)?'starPrime':h1prime.includes(n)?'prime':'platinum'):(n===173?'starGold':h2gold.includes(n)?'golden':'silver');
 const color=(hall===1?h1yellow:h2yellow).includes(n)?'yellow':(hall===1?h1orange:h2orange).includes(n)?'orange':'blue';
 let size=hall===1?(n===14||n>=117?'10 × 15':h1orange.includes(n)&&!h1prime.includes(n)?'10 × 16':'10 × 10'):n===173?'20 × 20':tier==='silver'?'10 × 10':null;
 return {n,hall,tier,color,size,price:tiers[tier].price,sourceIssue:hall===1&&[114,115,116].includes(n)?'sizeConflict':n===149?'numberConflict':null};
});
const place=(n,x,z,w,d,face='south')=>Object.assign(stalls[n-1],{x,z,w,d,face});
// Relative geometry transcribed from the supplied layouts; dimensions are schematic.
for(let n=1;n<=14;n++) place(n,3,n<=8?73-(n-1)*4.1:35-(n-9)*4.1,8,4.1,'east');
place(14,3,10.4,8,6.1,'east');
for(let i=0;i<14;i++){place(15+i,23,17+i*4.1,8,4.1,'west');place(32+i,31,17+i*4.1,8,4.1,'east');}
for(let i=0;i<3;i++)place(29+i,28+i*9,3,9,9);
for(let i=0;i<20;i++){place(46+i,52,17+i*3.8,8,3.8,'west');place(88-i,60,17+i*3.8,8,3.8,'east');}
for(let i=0;i<3;i++)place(89+i,56+i*9,3,9,9);
place(92,83,17,8,4.1,'west');place(93,83,21.1,8,4.1,'west');
for(let i=0;i<5;i++)place(94+i,83,25.2+i*4.1,22,4.1,'west');
for(let i=0;i<6;i++)place(99+i,83,45.7+i*4.1,8,4.1,'west');
place(105,83,70.3,8,4.1,'west');
for(let i=0;i<5;i++)place(106+i,83,78+i*3.8,8,3.8,'west');
for(let i=0;i<3;i++){place(119-i,91+i*6.1,60,6.1,14.4,'north');place(116-i,91+i*6.1,78,6.1,19,'north');}
for(let i=0;i<3;i++){place(66+i,52+i*9.5,101,9.5,6,'north');place(111+i,80.5+i*9.5,101,9.5,6,'north');}
// Hall 2 — right-hand entrance, upper-left exit, experience zones above cross aisles.
place(129,103,3,8,8);for(let i=0;i<8;i++)place(128-i,103,11+i*4.1,8,4.1,'west');place(120,103,43.8,8,4.1,'west');
place(162,75,3,7,8);for(let i=0;i<9;i++)place(161-i,75,11+i*4.1,7,4.1,'west');place(152,75,47.9,7,4.1,'west');place(151,75,58.5,7,7.5,'north');
place(139,87,11,7,4.1,'west');place(138,94,11,7,4.1,'east');
for(let i=0;i<9;i++)place(140+i,87,15.1+i*4.1,7,4.1,'west');
for(let i=0;i<8;i++)place(137-i,94,15.1+i*4.1,7,4.1,'east');
place(149,87,52,7,4.1,'west');place(150,87,56.1,7,9.9,'south');
for(let i=0;i<10;i++){place(184+i,30+i*4.5,43.8,4.5,4.1,'north');place(174+i,30+i*4.5,47.9,4.5,4.1,'south');}
place(172,30,58.5,4.5,7.5,'north');for(let i=0;i<9;i++)place(171-i,34.5+i*4.5,58.5,4.5,7.5,'north');
place(173,13.5,50,11.5,8.5,'south');
export const halls={
 1:{width:114,depth:110,count:119,facilities:[
  {key:'toilet',x:1,z:84,w:28,d:23,type:'common'},
  {key:'lift',x:3,z:39.1,w:8,d:5,type:'common'},
  {key:'lift',x:83,z:3,w:8,d:8,type:'common'},
  {key:'stairs',x:92,z:3,w:11,d:8,type:'stairs'},
  {key:'firstFloor',x:94,z:12,w:12,d:12,type:'passage',blocked:false},
  {key:'stairs',x:1,z:78.4,w:18,d:4.4,type:'stairs'},
  {key:'stairs',x:92,z:45.7,w:13,d:13,type:'stairs'}
 ],entry:{x:43.5,z:110}},
 2:{width:114,depth:69,count:74,facilities:[
  {key:'toilet',x:1,z:3,w:13,d:12,type:'common'},
  {key:'led',x:15.5,z:14,w:11,d:35,type:'common'},
  {key:'commonArea',x:67.5,z:7,w:7,d:29,type:'common'},
  {key:'foodCourt',n:195,x:30,z:3,w:18.5,d:33,type:'zone'},
  {key:'gameZone',n:194,x:48.5,z:3,w:18.5,d:33,type:'zone'}
 ],entry:{x:114,z:59},exit:{x:18,z:0}}
};
export const services=['starNights','industrial','agricultural','food','textile','corporateExhibitions','corporateEvents','birthdays','weddings','promotional'];
export const audience=['vendors','banking','traders','entrepreneurs','insurance','processing'];
export const districts=['Erode','Tiruppur','Coimbatore','Karur','Namakkal','Salem','Dindigul','Madurai'];
export const calendar=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Erode Genz Expo//EN\r\nBEGIN:VEVENT\r\nUID:erodegenz2027@expo.local\r\nDTSTAMP:20261117T000000Z\r\nDTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270104\r\nSUMMARY:Erode Genz Agri Expo 2027\r\nLOCATION:Texvalley\\, Chithode\\, Erode\\, Tamil Nadu\r\nDESCRIPTION:Four-day expo. Daily opening hours to be confirmed with organiser. Contact +91 7305719636 / +91 7305749636.\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
