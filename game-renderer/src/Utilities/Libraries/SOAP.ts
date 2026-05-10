import {v4 as uuidv4} from "uuid";

export const SOAP = (baseUrl: string, jobExpiration: number, finalScript: string) => {
    const jobId = uuidv4().toString();
    const scriptName = uuidv4().toString();

    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <OpenJobEx xmlns="${baseUrl}">
      <job>
        <id>${jobId}</id>
        <category>0</category>
        <cores>1</cores>
        <expirationInSeconds>${jobExpiration}</expirationInSeconds>
      </job>
      <script>
        <name>${scriptName}</name>
        <script><![CDATA[
${finalScript}
        ]]></script>
      </script>
    </OpenJobEx>
  </soap:Body>
</soap:Envelope>`;
};
