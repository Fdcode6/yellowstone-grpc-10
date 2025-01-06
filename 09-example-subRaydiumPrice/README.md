# subscribes Raydium price

This example subscribes to raydiumLiquidityPoolv4 pool transactions based on transactions filter conditions. By monitoring transactions of the raydiumLiquidityPoolv4 account, it obtains price change information for Raydium trading pairs.

Run using “npm start”, the output should be as follows:：

```bash
[20:50:09.323] INFO: 3ef48CZQ7nAKKL6WGckFw9mhgXqA3Y9GvfY4qqsZHgKhD4BkchMx3KHL9ygbpJrM8mSi65u4hcfuMWBtDiFNgyjv : 3TDdSCw5xgBa4g6jk5oaQFGAaBcsP1Md7vEovrWzi2dE : 0.000019119343005368142
[20:50:09.323] INFO: 31zV68Gnt67ap1fC1SGnv9n7xFTEETwsPCEqfAXJYxmpBYajLVSG1mP1uUTnMDoS2hPJsVbvFdLBXNPc87gtirPx : 3TDdSCw5xgBa4g6jk5oaQFGAaBcsP1Md7vEovrWzi2dE : 0.000019119343005368142
[20:50:09.324] INFO: 66aZkhCvs47mVsjmQPKS9TLd81ZKKupyazPGsUz4gUqdzvtCkhyVZ4HH3LGxb51fxqaVnzjMTrdpWzEuRCYaCtqF : 3TDdSCw5xgBa4g6jk5oaQFGAaBcsP1Md7vEovrWzi2dE : 0.000019119343005368142
[20:50:09.325] INFO: 2x98ttkvLtaWUyTBZdUFgpkMYFJ7W9AuF6YBrTuB6SG9YMiLS9LoYA1iTV5G8ZWB3LYstJJhRMHGK6tGBM9DEvpZ : 3TDdSCw5xgBa4g6jk5oaQFGAaBcsP1Md7vEovrWzi2dE : 0.000019119343005368142
[20:50:09.325] INFO: 5AdiGuDXyzbc6bDXburrvufrch3Q3qEjmSTZNVhCtLJMDZD4tL2H17N5Lbn3Cie482ZD1AynhMwHS5km2RRunriE : 3TDdSCw5xgBa4g6jk5oaQFGAaBcsP1Md7vEovrWzi2dE : 0.000019119343005368142
[20:50:09.329] INFO: 5CnHXDcUr6VYu9LDmYQsdfext5LFm53UjgBBvHcxbuFosT3HKVqy8oM4x8yt3g4re7DzPjqAFPe99W8yYke9uiUf : 3TDdSCw5xgBa4g6jk5oaQFGAaBcsP1Md7vEovrWzi2dE : 0.000019119343005368142
[20:50:09.329] INFO: 3QtbbN9ts5TcstXgqCmKDe4mD1225CTLdNLc5G6dKVBZGDyQNBduY4jfveqWK3QmmfcWhnMwct72zQxQdypGSjXR : 3TDdSCw5xgBa4g6jk5oaQFGAaBcsP1Md7vEovrWzi2dE : 0.000019119343005368142
^C[20:50:09.330] INFO: 65fE5d83qKJ4sZ9PYeMnerHUTekfF5kTqGoUGn6nWB2NTt3Yb4LggKGLSh2mAQCuchgPgGAAwbMpoKfJUvrKfVp5 : 3TDdSCw5xgBa4g6jk5oaQFGAaBcsP1Md7vEovrWzi2dE : 0.000019119343005368142
```

Output data explanation:
First column: signature - Transaction signature
Second column: mint - Trading pair mint
Third column: price for sol

