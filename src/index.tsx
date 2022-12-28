import { Detail, LaunchProps, getPreferenceValues } from "@raycast/api";
import { encodeURL, TransferRequestURLFields, findReference, FindReferenceError, validateTransfer } from "@solana/pay";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BigNumber from "bignumber.js";
import { useEffect, useMemo, useState } from "react";

interface PaymeArguments {
  amount: string;
  currency: string;
}

interface Preferences {
  recipient: string,
  label: string,
  connection: string,
  usdc: string,
}

export default function Payme(props: LaunchProps<{ arguments: PaymeArguments }>) {
  const { amount, currency } = props.arguments
  const { recipient, label, connection, usdc } = getPreferenceValues<Preferences>();
  const [isPaid, setIsPaid] = useState(false);

  const conn = new Connection(connection, 'confirmed');

  // error on invalid input
  BigNumber.DEBUG = true

  // Validation/conversion
  const recipientPublicKey = new PublicKey(recipient);
  const amountBigNumber = new BigNumber(amount);

  const currencyNormalised = currency.toLowerCase();
  let splToken: PublicKey | undefined = undefined;
  let currencyDisplay: string;

  switch (currencyNormalised) {
    case 'sol':
      currencyDisplay = 'SOL';
      break;
    case 'usdc':
      splToken = new PublicKey(usdc);
      currencyDisplay = 'USDC';
      break;
    default:
      throw new Error(`Unsupported currency ${currency}`);
  }

  const reference = useMemo(() => Keypair.generate().publicKey, []);

  // Transaction listener
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Check if there is any transaction for the reference
        const signatureInfo = await findReference(conn, reference);
        console.log('paid!', signatureInfo.signature)

        await validateTransfer(conn, signatureInfo.signature, {
          recipient: recipientPublicKey,
          amount: amountBigNumber,
          reference,
          splToken
        })

        // TODO: validate
        setIsPaid(true);
        clearInterval(interval);
      } catch (e) {
        if (e instanceof FindReferenceError) {
          // No transaction found yet, ignore this error
          return;
        }
        console.error('Unknown error', e)
        throw e;
      }
    }, 500)
    return () => {
      clearInterval(interval)
    }
  }, [connection, reference])

  const loadingSequence = ['.', '..', '...'];
  const [atInLoadingSequence, setAtInLoadingSequence] = useState(0);

  // Loading indicator
  useEffect(() => {
    setInterval(() => {
      setAtInLoadingSequence(curr => {
        if (curr + 1 >= loadingSequence.length) {
          return 0;
        }
        return curr + 1;
      })
    }, 200)
  }, []);

  // Create the QR code
  const urlParams: TransferRequestURLFields = {
    recipient: new PublicKey(recipient),
    amount: new BigNumber(amount), // amount in SOL
    reference,
    label,
    splToken,
  };

  const solanaUrl = encodeURL(urlParams);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(solanaUrl)}`
  console.log(solanaUrl, qrUrl);

  const title = `# Pay ${label} ${amount} ${currencyDisplay}`

  const paymentDisplay = `
  ${title}
  
  ![](${qrUrl})
  
  Waiting for payment${loadingSequence[atInLoadingSequence]}`

  const paidDisplay = `
  ${title}

  ## Payment received, thankyou! ✅`

  return (
    <Detail
      isLoading={!isPaid}
      markdown={isPaid ? paidDisplay : paymentDisplay}
    />
  );
}
