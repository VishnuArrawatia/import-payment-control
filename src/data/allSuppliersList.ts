export interface MasterSupplierDefinition {
  vendorCode: string;
  supplierName: string;
  country: string;
  defaultCurrency: 'USD' | 'CNY';
  companyCode?: string; // 'Sakar' or 'SVN'
}

export const ALL_MASTER_SUPPLIERS: MasterSupplierDefinition[] = [
  { vendorCode: 'V00044', supplierName: 'BRIGHT UNIVERSE HK CO LTD', country: 'China', defaultCurrency: 'USD', companyCode: 'Sakar' },
  { vendorCode: 'V00847', supplierName: 'Ferrics Technology Co Limited', country: 'China', defaultCurrency: 'USD', companyCode: 'Sakar' },
  { vendorCode: 'V00900', supplierName: 'Zhongshan Newaycan Trading Corporation Limited', country: 'China', defaultCurrency: 'USD', companyCode: 'Sakar' },
  { vendorCode: 'V00963', supplierName: 'Zhejiang Foso Electronics Technology Co. Ltd.', country: 'China', defaultCurrency: 'USD', companyCode: 'Sakar' },
  { vendorCode: 'V00964', supplierName: 'Zhongshan Guangyu Lighting Electric Appliance Co. Ltd.', country: 'China', defaultCurrency: 'USD', companyCode: 'Sakar' },
  { vendorCode: 'V01002', supplierName: 'Zhongshan Guohang Hardware Co.,Ltd', country: 'China', defaultCurrency: 'USD', companyCode: 'Sakar' },
  { vendorCode: 'V01017', supplierName: 'YIWU YULIANG E-COMMERCE FIRM', country: 'China', defaultCurrency: 'USD', companyCode: 'Sakar' },
  { vendorCode: 'V01020', supplierName: 'FSP INNOVATIONS(HK) LIMITED', country: 'China', defaultCurrency: 'USD', companyCode: 'Sakar' },
  { vendorCode: 'V00088', supplierName: 'FOSHAN ENFALION ELECTRONICS CO.LTD', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00138', supplierName: 'LOTTE CHEMICAL CORPORATION', country: 'South Korea', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00677', supplierName: 'HONG KONG EFAN ELECTRONICS LIMITED', country: 'Hong Kong', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00698', supplierName: 'FOSHAN CITY XIN YUAN ELECTRONIC CO.,LTD', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00721', supplierName: 'Shenzhen Lanjin photoelectric Co.,Ltd', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00738', supplierName: 'Foshan Sinoway Machinery Equipment Sales Company', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00740', supplierName: 'ZHEJIANG FOSO ELECTRONICS TECHNOLOGY CO., LTD.', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00753', supplierName: 'YIYA TECHNOLOGY CO., LIMITED', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00850', supplierName: 'LITEONTECH LIMITED', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00885', supplierName: 'ZHONGSHAN NEWAYCAN TRADING CORPORATION LIMITED', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00905', supplierName: 'San Yi New Material CO.,LTD', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00928', supplierName: 'Shenzhen CYT Semiconductor Technology Co., Ltd.', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00985', supplierName: 'Goldland Electronic Technology Co., Ltd', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00987', supplierName: 'SHENZHEN RUNLITE TECHNOLOGY CO. LTD', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00992', supplierName: 'Zhongshan Liandi photoelectric Co.,Ltd', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00993', supplierName: 'Shenzhen Linshang Technology Co., Ltd.', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00995', supplierName: 'SHENZHEN SALWAY INDUSTRIAL CO.LTD', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V00996', supplierName: 'ZHONGSHAN BU LUO MU LIGHTING COMPANY', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V01004', supplierName: 'Zhongshan Wangyuan Lighting Technology Co,Ltd', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V01008', supplierName: 'HUIZHOU JINGQIN ELECTRONIC COMPONENTS CO.LTD', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V01027', supplierName: 'Fujian GW Technology Co.,Ltd', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V01040', supplierName: 'XIAMEN TECH STANDARD LIMITED', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V01060', supplierName: 'Power Chip Technologies (Suzhou) Co.,LTD', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V01105', supplierName: 'SHENZHEN ETON AUTOMATION EQUIPMENT CO LTD', country: 'China', defaultCurrency: 'USD', companyCode: 'SVN' },
  { vendorCode: 'V01118', supplierName: 'TECHNOLOGY PP INDUSTRIES (NORTHERN) SDN BHD', country: 'Malaysia', defaultCurrency: 'USD', companyCode: 'SVN' },
];
